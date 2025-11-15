package api

import (
	"net/http"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

const version = "0.1.0"

// Health returns the dashboard health summary along with agent information.
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	agents := h.store.Agents()
	status := "ok"
	for _, agent := range agents {
		if agent.Status != "healthy" {
			status = "degraded"
			break
		}
	}

	type response struct {
		Status  string            `json:"status"`
		Version string            `json:"version"`
		Agents  []store.AgentInfo `json:"agents"`
	}

	writeJSON(w, http.StatusOK, response{
		Status:  status,
		Version: version,
		Agents:  agents,
	})
}
