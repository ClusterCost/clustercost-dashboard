package grpc

import (
	"context"
	"fmt"
	"log"

	agentv1 "github.com/clustercost/clustercost-dashboard/internal/proto/agent/v1"
)

type Collector struct {
	agentv1.UnimplementedCollectorServer
	ingestor ReportIngestor
}

type ReportIngestor interface {
	Enqueue(agentName string, req *agentv1.ReportRequest) bool
}

func NewCollector(ingestor ReportIngestor) *Collector {
	return &Collector{ingestor: ingestor}
}

func (c *Collector) Report(ctx context.Context, req *agentv1.ReportRequest) (*agentv1.ReportResponse, error) {
	if err := c.processReport(req); err != nil {
		log.Printf("Failed to process report from agent %s: %v", req.AgentId, err)
		return &agentv1.ReportResponse{
			Accepted:     false,
			ErrorMessage: err.Error(),
		}, nil
	}
	return &agentv1.ReportResponse{Accepted: true}, nil
}

func (c *Collector) processReport(req *agentv1.ReportRequest) error {
	// Identify agent.
	agentName := req.AgentId
	if agentName == "" {
		return fmt.Errorf("missing agent_id")
	}

	if c.ingestor == nil {
		return fmt.Errorf("ingestor not configured")
	}

	if ok := c.ingestor.Enqueue(agentName, req); !ok {
		return fmt.Errorf("ingest queue full")
	}
	return nil
}
