package api

import "net/http"

// Agents returns configured agents and their last known status.
func (h *Handler) Agents(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, h.store.Agents())
}
