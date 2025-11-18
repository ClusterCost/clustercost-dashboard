package store

import (
	"testing"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/agents"
	"github.com/clustercost/clustercost-dashboard/internal/config"
)

func newTestStore() *Store {
	cfgs := []config.AgentConfig{
		{Name: "test-agent", BaseURL: "http://example.com", Type: "k8s"},
	}
	return New(cfgs, "v1.0.0")
}

func TestClusterMetadataReturnsLatestSnapshot(t *testing.T) {
	s := newTestStore()
	now := time.Now().UTC()
	s.Update("test-agent", AgentSnapshot{
		LastScrape: now,
		Health: &agents.HealthResponse{
			Status:      "ok",
			ClusterID:   "cluster-1",
			ClusterName: "Cluster One",
			ClusterType: "k8s",
			Region:      "us-east-1",
			Version:     "dev",
			Timestamp:   now,
		},
	})

	meta, err := s.ClusterMetadata()
	if err != nil {
		t.Fatalf("ClusterMetadata returned error: %v", err)
	}
	if meta.Name != "Cluster One" {
		t.Fatalf("expected cluster name to be preserved, got %q", meta.Name)
	}
	if meta.Type != "k8s" {
		t.Fatalf("expected cluster type k8s, got %q", meta.Type)
	}
	if meta.Region != "us-east-1" {
		t.Fatalf("expected region us-east-1, got %q", meta.Region)
	}
	if meta.Version != "dev" {
		t.Fatalf("expected version dev, got %q", meta.Version)
	}
	if meta.Timestamp.IsZero() {
		t.Fatal("expected metadata timestamp to be set")
	}
}

func TestAgentStatusConnectedWhenDataFresh(t *testing.T) {
	s := newTestStore()
	now := time.Now().UTC()

	s.Update("test-agent", AgentSnapshot{
		LastScrape: now,
		Health: &agents.HealthResponse{
			Status:      "ok",
			ClusterID:   "cluster-2",
			ClusterName: "Cluster Two",
			ClusterType: "k8s",
			Region:      "us-west-2",
			Version:     "dev",
			Timestamp:   now,
		},
		Namespaces: &agents.NamespacesResponse{
			Timestamp: now,
		},
		Nodes: &agents.NodesResponse{
			Timestamp: now,
			Items: []agents.NodeCost{
				{NodeName: "node-1"},
			},
		},
		Resources: &agents.ResourcesResponse{
			Timestamp: now,
		},
	})

	status, err := s.AgentStatus()
	if err != nil {
		t.Fatalf("AgentStatus returned error: %v", err)
	}
	if status.Status != "connected" {
		t.Fatalf("expected status connected, got %q", status.Status)
	}
	if status.ClusterName != "Cluster Two" {
		t.Fatalf("expected cluster name Cluster Two, got %q", status.ClusterName)
	}
	if status.ClusterType != "k8s" {
		t.Fatalf("expected cluster type k8s, got %q", status.ClusterType)
	}
	if status.ClusterRegion != "us-west-2" {
		t.Fatalf("expected region us-west-2, got %q", status.ClusterRegion)
	}
	if status.NodeCount != 1 {
		t.Fatalf("expected node count 1, got %d", status.NodeCount)
	}
	if status.Datasets.Namespaces != "ok" || status.Datasets.Nodes != "ok" || status.Datasets.Resources != "ok" {
		t.Fatalf("expected all datasets to be ok, got %+v", status.Datasets)
	}
}
