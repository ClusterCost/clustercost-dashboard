package grpc_test

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/config"
	ccgrpc "github.com/clustercost/clustercost-dashboard/internal/grpc"
	agentv1 "github.com/clustercost/clustercost-dashboard/internal/proto/agent/v1"
	"github.com/clustercost/clustercost-dashboard/internal/store"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

func TestGRPCServer_Integration(t *testing.T) {
	// 1. Setup
	token := "valid-token-123"
	defaultToken := "global-default"
	agentName := "test-agent"
	unknownAgent := "new-agent-using-default"

	cfg := config.Config{
		GrpcAddr:          ":0", // Random port
		DefaultAgentToken: defaultToken,
		Agents: []config.AgentConfig{
			{Name: agentName, Token: token, Type: "k8s"},
		},
	}

	// Initialize Store
	s := store.New(cfg.Agents, "v1.0.0")

	// Start Server
	lis, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer lis.Close()

	srv := ccgrpc.NewServer(s, cfg)

	// Run server in goroutine
	go func() {
		if err := srv.Serve(lis); err != nil && err != grpc.ErrServerStopped {
			// t.Logf("server stopped: %v", err)
		}
	}()
	defer srv.Stop()

	// 2. Client Setup
	conn, err := grpc.Dial(lis.Addr().String(), grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("did not connect: %v", err)
	}
	defer conn.Close()
	c := agentv1.NewCollectorClient(conn)

	// 3. Test Case: Unauthenticated
	ctx := context.Background()
	_, err = c.Report(ctx, &agentv1.ReportRequest{AgentId: agentName})
	if status.Code(err) != codes.Unauthenticated {
		t.Errorf("expected Unauthenticated, got: %v", err)
	}

	// 4. Test Case: Invalid Token
	ctx = metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer invalid"))
	_, err = c.Report(ctx, &agentv1.ReportRequest{AgentId: agentName})
	if status.Code(err) != codes.Unauthenticated {
		t.Errorf("expected Unauthenticated for invalid token, got: %v", err)
	}

	// 5. Test Case: Valid Report
	ctx = metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+token))

	ts := time.Now().Unix()
	req := &agentv1.ReportRequest{
		AgentId:          agentName,
		ClusterId:        "cluster-1",
		TimestampSeconds: ts,
		Snapshot: &agentv1.Snapshot{
			TimestampSeconds: ts,
			Namespaces: []*agentv1.NamespaceCostRecord{
				{Namespace: "default", HourlyCost: 1.5},
			},
		},
	}

	resp, err := c.Report(ctx, req)
	if err != nil {
		t.Fatalf("Report failed: %v", err)
	}
	if !resp.Accepted {
		t.Errorf("Report not accepted: %s", resp.ErrorMessage)
	}

	// 5b. Test Case: Valid Report with Default Token
	ctx = metadata.NewOutgoingContext(context.Background(), metadata.Pairs("authorization", "Bearer "+defaultToken))
	reqDefault := &agentv1.ReportRequest{
		AgentId:          unknownAgent,
		ClusterId:        "cluster-2",
		TimestampSeconds: ts,
		Snapshot: &agentv1.Snapshot{
			TimestampSeconds: ts,
		},
	}
	resp, err = c.Report(ctx, reqDefault)
	if err != nil {
		t.Fatalf("Default token Report failed: %v", err)
	}
	if !resp.Accepted {
		t.Errorf("Default token Report not accepted: %s", resp.ErrorMessage)
	}

	// 6. Verify Store Update
	// Allow a moment for update (though it should be synchronous in our impl)
	snapshots := s.Agents()
	found := false
	for _, info := range snapshots {
		if info.Name == agentName {
			if info.Status != "connected" {
				t.Errorf("expected status connected, got %s", info.Status)
			}
			found = true
			break
		}
	}
	if !found {
		t.Errorf("agent %s not found in store", agentName)
	}

	// Check default token agent
	foundDefault := false
	for _, info := range snapshots {
		if info.Name == unknownAgent {
			foundDefault = true
			break
		}
	}
	if !foundDefault {
		t.Errorf("default token agent %s not found in store", unknownAgent)
	}

	// Deep check
	nsSummary, err := s.NamespaceDetail("default")
	if err != nil {
		t.Errorf("failed to get namespace detail: %v", err)
	} else {
		if nsSummary.HourlyCost != 1.5 {
			t.Errorf("expected cost 1.5, got %f", nsSummary.HourlyCost)
		}
	}
}

// Helper to expose Serve for testing since the struct wraps grpc.Server
// We need to modify internal/grpc/server.go to expose the raw server or a Serve method for the listener.
// Currently it has ListenAndServe which creates listener.
// Let's modify Server.go to allow passing a listener or exposing Serve.
