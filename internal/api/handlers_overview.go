package api

import (
	"net/http"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// Overview serves the aggregated overview payload.
func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	overview, err := h.store.Overview()
	if err != nil {
		if err == store.ErrNoData {
			writeError(w, http.StatusServiceUnavailable, "data not yet available")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, overview)
}
