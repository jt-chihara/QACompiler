package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

type CreateTodoRequest struct {
	Title string `json:"title"`
}

type UpdateTodoRequest struct {
	Title     string `json:"title"`
	Completed bool   `json:"completed"`
}

type ErrorResponse struct {
	Error string `json:"error"`
}

type Handler struct {
	store *TodoStore
}

func NewHandler(store *TodoStore) *Handler {
	return &Handler{store: store}
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/todos")

	switch {
	case r.Method == http.MethodGet && path == "":
		h.handleList(w, r)
	case r.Method == http.MethodPost && path == "":
		h.handleCreate(w, r)
	case r.Method == http.MethodPut && len(path) > 1:
		h.handleUpdate(w, r, path[1:])
	case r.Method == http.MethodDelete && len(path) > 1:
		h.handleDelete(w, r, path[1:])
	default:
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "not found"})
	}
}

func (h *Handler) handleList(w http.ResponseWriter, r *http.Request) {
	todos := h.store.List()
	json.NewEncoder(w).Encode(todos)
}

func (h *Handler) handleCreate(w http.ResponseWriter, r *http.Request) {
	var req CreateTodoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "invalid request body"})
		return
	}

	if strings.TrimSpace(req.Title) == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "title is required"})
		return
	}

	todo := h.store.Create(req.Title)
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(todo)
}

func (h *Handler) handleUpdate(w http.ResponseWriter, r *http.Request, id string) {
	var req UpdateTodoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "invalid request body"})
		return
	}

	todo, ok := h.store.Update(id, req.Title, req.Completed)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "todo not found"})
		return
	}

	json.NewEncoder(w).Encode(todo)
}

func (h *Handler) handleDelete(w http.ResponseWriter, r *http.Request, id string) {
	ok := h.store.Delete(id)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "todo not found"})
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
