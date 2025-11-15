package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/clustercost/clustercost-dashboard/internal/static"
	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// Handler wires HTTP requests to the in-memory store.
type Handler struct {
	store *store.Store
}

// NewRouter builds the HTTP router serving both JSON APIs and static assets.
func NewRouter(s *store.Store) http.Handler {
	h := &Handler{store: s}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(api chi.Router) {
		api.Get("/health", h.Health)
		api.Get("/overview", h.Overview)
		api.Get("/namespaces", h.Namespaces)
		api.Get("/pods", h.Pods)
		api.Get("/nodes", h.Nodes)
		api.Get("/workloads", h.Workloads)
		api.Get("/agents", h.Agents)
	})

	r.Handle("/*", static.Handler())
	r.Handle("/", static.Handler())

	return r
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
