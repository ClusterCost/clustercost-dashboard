package grpc

import (
	"fmt"
	"net"

	"github.com/clustercost/clustercost-dashboard/internal/config"
	agentv1 "github.com/clustercost/clustercost-dashboard/internal/proto/agent/v1"
	"github.com/clustercost/clustercost-dashboard/internal/store"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

type Server struct {
	grpcServer *grpc.Server
}

func NewServer(s *store.Store, cfg config.Config) *Server {
	auth := NewAuthInterceptor(cfg.Agents, cfg.DefaultAgentToken)

	opts := []grpc.ServerOption{
		grpc.UnaryInterceptor(auth.Unary()),
	}

	gsrv := grpc.NewServer(opts...)

	collector := NewCollector(s)
	agentv1.RegisterCollectorServer(gsrv, collector)

	// Register reflection service on gRPC server (useful for grpcurl).
	reflection.Register(gsrv)

	return &Server{
		grpcServer: gsrv,
	}
}

func (s *Server) ListenAndServe(addr string) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %v", err)
	}
	return s.Serve(lis)
}

func (s *Server) Serve(lis net.Listener) error {
	return s.grpcServer.Serve(lis)
}

func (s *Server) Stop() {
	s.grpcServer.GracefulStop()
}
