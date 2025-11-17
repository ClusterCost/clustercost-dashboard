package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/agents"
	"github.com/clustercost/clustercost-dashboard/internal/api"
	"github.com/clustercost/clustercost-dashboard/internal/config"
	"github.com/clustercost/clustercost-dashboard/internal/logging"
	"github.com/clustercost/clustercost-dashboard/internal/store"
)

func main() {
	logger := logging.New("dashboard")

	cfg, err := config.Load()
	if err != nil {
		logger.Fatalf("load config: %v", err)
	}

	s := store.New(cfg.Agents, cfg.RecommendedAgentVersion)
	client := agents.NewClient(10 * time.Second)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go func() {
		ticker := time.NewTicker(cfg.PollInterval)
		defer ticker.Stop()
		logger.Printf("starting poller with interval %s", cfg.PollInterval)
		for {
			if err := pollAgents(ctx, client, s, cfg, logger); err != nil {
				logger.Printf("poll error: %v", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()

	srv := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: api.NewRouter(s),
	}

	go func() {
		<-ctx.Done()
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdownCtx)
	}()

	logger.Printf("listening on %s", cfg.ListenAddr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		logger.Fatalf("server error: %v", err)
	}
}

func pollAgents(ctx context.Context, client *agents.Client, s *store.Store, cfg config.Config, logger *log.Logger) error {
	for _, agent := range cfg.Agents {
		snapshot := scrapeAgent(ctx, client, agent)
		if snapshot.LastError != "" {
			logger.Printf("agent %s error: %s", agent.Name, snapshot.LastError)
		}
		s.Update(agent.Name, snapshot)
	}
	return nil
}

func scrapeAgent(ctx context.Context, client *agents.Client, cfg config.AgentConfig) store.AgentSnapshot {
	agentCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()

	snapshot := store.AgentSnapshot{LastScrape: time.Now()}
	var errs []string

	if health, err := client.FetchHealth(agentCtx, cfg.BaseURL); err != nil {
		errs = append(errs, fmt.Sprintf("health: %v", err))
	} else {
		snapshot.Health = &health
	}

	if namespaces, err := client.FetchNamespaces(agentCtx, cfg.BaseURL); err != nil {
		errs = append(errs, fmt.Sprintf("namespaces: %v", err))
	} else {
		snapshot.Namespaces = &namespaces
	}

	if nodes, err := client.FetchNodes(agentCtx, cfg.BaseURL); err != nil {
		errs = append(errs, fmt.Sprintf("nodes: %v", err))
	} else {
		snapshot.Nodes = &nodes
	}

	if resources, err := client.FetchResources(agentCtx, cfg.BaseURL); err != nil {
		errs = append(errs, fmt.Sprintf("resources: %v", err))
	} else {
		snapshot.Resources = &resources
	}

	if len(errs) > 0 {
		snapshot.LastError = strings.Join(errs, "; ")
	}

	return snapshot
}
