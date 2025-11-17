package api

import (
	"net/http"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// Health returns a simple readiness payload.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	clusterName, timestamp, err := h.store.ClusterMetadata()
	status := "ok"

	switch err {
	case nil:
		agents := h.store.Agents()
		for _, agent := range agents {
			if agent.Status != "healthy" {
				status = "degraded"
				break
			}
		}
	case store.ErrNoData:
		status = "initializing"
		if timestamp.IsZero() {
			timestamp = time.Now().UTC()
		}
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	if timestamp.IsZero() {
		timestamp = time.Now().UTC()
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":      status,
		"clusterName": clusterName,
		"timestamp":   timestamp,
	})
}
