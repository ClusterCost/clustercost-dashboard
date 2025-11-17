package api

import (
	"net/http"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// AgentStatus returns the aggregated agent connection status.
func (h *Handler) AgentStatus(w http.ResponseWriter, r *http.Request) {
	status, err := h.store.AgentStatus()
	if err != nil {
		if err == store.ErrNoData {
			writeError(w, http.StatusServiceUnavailable, "agent data not yet available")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, status)
}
