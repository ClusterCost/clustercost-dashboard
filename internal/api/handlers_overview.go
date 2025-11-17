package api

import (
	"net/http"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// Overview serves the aggregated overview payload.
func (h *Handler) Overview(w http.ResponseWriter, r *http.Request) {
	limit := parseLimit(r.URL.Query().Get("limitTopNamespaces"), 5, 20)

	overview, err := h.store.Overview(limit)
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
