package config

import (
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// AgentConfig describes a single ClusterCost agent instance.
type AgentConfig struct {
	Name    string `yaml:"name"`
	BaseURL string `yaml:"baseUrl"`
	Type    string `yaml:"type"`
}

// Config contains runtime settings for the dashboard backend.
type Config struct {
	ListenAddr              string        `yaml:"listenAddr"`
	PollInterval            time.Duration `yaml:"pollInterval"`
	Agents                  []AgentConfig `yaml:"agents"`
	RecommendedAgentVersion string        `yaml:"recommendedAgentVersion"`
}

// Default returns the default configuration used when no other information is provided.
func Default() Config {
	return Config{
		ListenAddr:   ":9090",
		PollInterval: 30 * time.Second,
		Agents:       []AgentConfig{},
	}
}

// Load reads configuration from environment variables and an optional YAML file.
func Load() (Config, error) {
	cfg := Default()

	if listen := os.Getenv("LISTEN_ADDR"); listen != "" {
		cfg.ListenAddr = listen
	}

	if interval := os.Getenv("POLL_INTERVAL"); interval != "" {
		d, err := time.ParseDuration(interval)
		if err != nil {
			return Config{}, fmt.Errorf("invalid POLL_INTERVAL: %w", err)
		}
		cfg.PollInterval = d
	}

	if file := os.Getenv("CONFIG_FILE"); file != "" {
		loaded, err := fromFile(file)
		if err != nil {
			return Config{}, err
		}
		merge(&cfg, loaded)
	}

	if urls := os.Getenv("AGENT_URLS"); urls != "" {
		cfg.Agents = []AgentConfig{}
		for idx, raw := range strings.Split(urls, ",") {
			trimmed := strings.TrimSpace(raw)
			if trimmed == "" {
				continue
			}
			name := fmt.Sprintf("agent-%d", idx+1)
			cfg.Agents = append(cfg.Agents, AgentConfig{
				Name:    name,
				BaseURL: trimmed,
				Type:    "k8s",
			})
		}
	}

	if expected := os.Getenv("RECOMMENDED_AGENT_VERSION"); expected != "" {
		cfg.RecommendedAgentVersion = expected
	}

	if len(cfg.Agents) == 0 {
		return Config{}, errors.New("no agents configured - set CONFIG_FILE or AGENT_URLS")
	}

	return cfg, nil
}

func fromFile(path string) (Config, error) {
	b, err := ioutil.ReadFile(path)
	if err != nil {
		return Config{}, fmt.Errorf("read config file: %w", err)
	}

	cfg := Default()
	if err := yaml.Unmarshal(b, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse config file: %w", err)
	}

	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":9090"
	}
	if cfg.PollInterval == 0 {
		cfg.PollInterval = 30 * time.Second
	}

	return cfg, nil
}

func merge(dst *Config, src Config) {
	if src.ListenAddr != "" {
		dst.ListenAddr = src.ListenAddr
	}
	if src.PollInterval != 0 {
		dst.PollInterval = src.PollInterval
	}

	if len(src.Agents) > 0 {
		dst.Agents = src.Agents
	}
	if src.RecommendedAgentVersion != "" {
		dst.RecommendedAgentVersion = src.RecommendedAgentVersion
	}
}
