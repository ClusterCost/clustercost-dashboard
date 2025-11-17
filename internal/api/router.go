package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

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
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{http.MethodGet, http.MethodOptions},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Requested-With"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api", func(api chi.Router) {
		api.Get("/health", h.Health)
		api.Route("/cost", func(cost chi.Router) {
			cost.Get("/overview", h.Overview)
			cost.Get("/namespaces", h.Namespaces)
			cost.Get("/namespaces/{name}", h.NamespaceDetail)
			cost.Get("/nodes", h.Nodes)
			cost.Get("/nodes/{name}", h.NodeDetail)
			cost.Get("/resources", h.Resources)
		})
		api.Get("/agent", h.AgentStatus)
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
