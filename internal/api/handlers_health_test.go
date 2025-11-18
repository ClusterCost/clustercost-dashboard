package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/agents"
	"github.com/clustercost/clustercost-dashboard/internal/config"
	"github.com/clustercost/clustercost-dashboard/internal/store"
)

func newTestHandler() *Handler {
	cfgs := []config.AgentConfig{
		{Name: "agent", BaseURL: "http://example.com", Type: "k8s"},
	}
	s := store.New(cfgs, "v1.0.0")
	return &Handler{store: s}
}

func TestHealthHandlerReturnsClusterMetadata(t *testing.T) {
	h := newTestHandler()
	now := time.Now().UTC()
	h.store.Update("agent", store.AgentSnapshot{
		LastScrape: now,
		Health: &agents.HealthResponse{
			Status:      "healthy",
			ClusterID:   "cluster-123",
			ClusterName: "Test Cluster",
			ClusterType: "k8s",
			Region:      "us-east-2",
			Version:     "dev",
			Timestamp:   now,
		},
	})

	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()

	h.Health(rec, req)

	res := rec.Result()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected status OK, got %d", res.StatusCode)
	}
	var payload map[string]any
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		t.Fatalf("decode payload: %v", err)
	}
	if payload["clusterName"] != "Test Cluster" {
		t.Fatalf("expected clusterName Test Cluster, got %v", payload["clusterName"])
	}
	if payload["clusterRegion"] != "us-east-2" {
		t.Fatalf("expected clusterRegion us-east-2, got %v", payload["clusterRegion"])
	}
	if payload["status"] != "ok" {
		t.Fatalf("expected status ok, got %v", payload["status"])
	}
}
