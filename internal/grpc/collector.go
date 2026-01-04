package grpc

import (
	"context"
	"fmt"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/agents"
	agentv1 "github.com/clustercost/clustercost-dashboard/internal/proto/agent/v1"
	"github.com/clustercost/clustercost-dashboard/internal/store"
)

type Collector struct {
	agentv1.UnimplementedCollectorServer
	store *store.Store
}

func NewCollector(s *store.Store) *Collector {
	return &Collector{store: s}
}

func (c *Collector) Report(ctx context.Context, req *agentv1.ReportRequest) (*agentv1.ReportResponse, error) {
	if err := c.processReport(ctx, req); err != nil {
		return &agentv1.ReportResponse{
			Accepted:     false,
			ErrorMessage: err.Error(),
		}, nil
	}
	return &agentv1.ReportResponse{Accepted: true}, nil
}

func (c *Collector) ReportBatch(ctx context.Context, req *agentv1.ReportBatchRequest) (*agentv1.ReportResponse, error) {
	var lastErr error
	for _, report := range req.Reports {
		if err := c.processReport(ctx, report); err != nil {
			lastErr = err
			// Continue processing other reports?
			// For now, we'll try to process all and return error if any failed.
			// Ideally we should return partial success status, but the proto has simple boolean.
		}
	}

	if lastErr != nil {
		return &agentv1.ReportResponse{
			Accepted:     false,
			ErrorMessage: fmt.Sprintf("some reports failed, last error: %v", lastErr),
		}, nil
	}

	return &agentv1.ReportResponse{Accepted: true}, nil
}

func (c *Collector) processReport(ctx context.Context, req *agentv1.ReportRequest) error {
	// Identify agent.
	// Ideally we get agent name from context (AuthInterceptor), or we trust the agent_id in request.
	// We'll use the agent_id from the request as the key for the store updates.
	// If the auth interceptor put the "agent_name" in context, we could verify it matches or use it.

	agentName := req.AgentId
	if agentName == "" {
		// Fallback to retrieving from context if available, or error
		if name, ok := ctx.Value("agent_name").(string); ok {
			agentName = name
		} else {
			return fmt.Errorf("missing agent_id")
		}
	}

	snap := mapProtoToSnapshot(req)
	c.store.Update(agentName, snap)
	return nil
}

func mapProtoToSnapshot(req *agentv1.ReportRequest) store.AgentSnapshot {
	ts := time.Unix(req.TimestampSeconds, 0)
	if req.Snapshot == nil {
		return store.AgentSnapshot{
			LastScrape: ts,
			Health: &agents.HealthResponse{
				Status:      "connected", // If we got a report, it's connected
				ClusterID:   req.ClusterId,
				ClusterName: req.ClusterName,
				Version:     req.Version,
				Timestamp:   ts,
			},
		}
	}

	// Health
	health := &agents.HealthResponse{
		Status:      "connected",
		ClusterID:   req.ClusterId,
		ClusterName: req.ClusterName,
		Version:     req.Version,
		Timestamp:   ts,
	}

	// Namespaces
	var nsItems []agents.NamespaceCost
	for _, item := range req.Snapshot.Namespaces {
		nsItems = append(nsItems, agents.NamespaceCost{
			ClusterID:          req.ClusterId,
			Namespace:          item.Namespace,
			HourlyCost:         item.HourlyCost,
			PodCount:           int(item.PodCount),
			CPURequestMilli:    item.CpuRequestMilli,
			MemoryRequestBytes: item.MemoryRequestBytes,
			CPUUsageMilli:      item.CpuUsageMilli,
			MemoryUsageBytes:   item.MemoryUsageBytes,
			Labels:             item.Labels,
			Environment:        item.Environment,
		})
	}
	namespaces := &agents.NamespacesResponse{
		Items:     nsItems,
		Timestamp: ts,
	}

	// Nodes
	var nodeItems []agents.NodeCost
	for _, item := range req.Snapshot.Nodes {
		nodeItems = append(nodeItems, agents.NodeCost{
			ClusterID:              req.ClusterId,
			NodeName:               item.NodeName,
			HourlyCost:             item.HourlyCost,
			CPUUsagePercent:        item.CpuUsagePercent,
			MemoryUsagePercent:     item.MemoryUsagePercent,
			CPUAllocatableMilli:    item.CpuAllocatableMilli,
			MemoryAllocatableBytes: item.MemoryAllocatableBytes,
			PodCount:               int(item.PodCount),
			Status:                 item.Status,
			IsUnderPressure:        item.IsUnderPressure,
			InstanceType:           item.InstanceType,
			Labels:                 item.Labels,
			Taints:                 item.Taints,
		})
	}
	nodes := &agents.NodesResponse{
		Items:     nodeItems,
		Timestamp: ts,
	}

	// Resources
	var resources *agents.ResourcesResponse
	if req.Snapshot.Resources != nil {
		resources = &agents.ResourcesResponse{
			Timestamp: ts,
			Snapshot: agents.ResourceSnapshot{
				CPUUsageMilliTotal:      req.Snapshot.Resources.CpuUsageMilliTotal,
				CPURequestMilliTotal:    req.Snapshot.Resources.CpuRequestMilliTotal,
				MemoryUsageBytesTotal:   req.Snapshot.Resources.MemoryUsageBytesTotal,
				MemoryRequestBytesTotal: req.Snapshot.Resources.MemoryRequestBytesTotal,
				TotalNodeHourlyCost:     req.Snapshot.Resources.TotalNodeHourlyCost,
			},
		}
	}

	return store.AgentSnapshot{
		Health:     health,
		Namespaces: namespaces,
		Nodes:      nodes,
		Resources:  resources,
		LastScrape: time.Now(), // Or use ts? Store usually expects LastScrape to be "now" relative to the server receiving it.
	}
}
