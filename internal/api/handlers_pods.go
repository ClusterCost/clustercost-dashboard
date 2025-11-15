package api

import (
	"net/http"

	"github.com/clustercost/clustercost-dashboard/internal/store"
)

// Pods returns pod-level cost data with optional namespace filtering.
func (h *Handler) Pods(w http.ResponseWriter, r *http.Request) {
	namespace := r.URL.Query().Get("namespace")
	pods, err := h.store.Pods(namespace)
	if err != nil {
		if err == store.ErrNoData {
			writeError(w, http.StatusServiceUnavailable, "data not yet available")
			return
		}
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, pods)
}
