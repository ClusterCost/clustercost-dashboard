package api

import (
	"net/http"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// Workloads returns aggregated workload metrics.
func (h *Handler) Workloads(w http.ResponseWriter, r *http.Request) {
	data, err := h.store.Workloads()
	if err != nil {
		if err == store.ErrNoData {
			writeError(w, http.StatusServiceUnavailable, "data not yet available")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, data)
}
