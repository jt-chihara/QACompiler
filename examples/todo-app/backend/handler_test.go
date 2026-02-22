package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHandleCreate(t *testing.T) {
	store := NewTodoStore()
	handler := NewHandler(store)

	body := `{"title": "Buy milk"}`
	req := httptest.NewRequest(http.MethodPost, "/api/todos", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected status 201, got %d", w.Code)
	}

	var todo Todo
	json.NewDecoder(w.Body).Decode(&todo)
	if todo.Title != "Buy milk" {
		t.Errorf("expected title 'Buy milk', got '%s'", todo.Title)
	}
	if todo.Completed {
		t.Error("expected completed to be false")
	}
}

func TestHandleCreateEmptyTitle(t *testing.T) {
	store := NewTodoStore()
	handler := NewHandler(store)

	body := `{"title": ""}`
	req := httptest.NewRequest(http.MethodPost, "/api/todos", bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected status 400, got %d", w.Code)
	}
}

func TestHandleList(t *testing.T) {
	store := NewTodoStore()
	store.Create("Task 1")
	store.Create("Task 2")
	handler := NewHandler(store)

	req := httptest.NewRequest(http.MethodGet, "/api/todos", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var todos []Todo
	json.NewDecoder(w.Body).Decode(&todos)
	if len(todos) != 2 {
		t.Errorf("expected 2 todos, got %d", len(todos))
	}
}

func TestHandleUpdate(t *testing.T) {
	store := NewTodoStore()
	todo := store.Create("Old title")
	handler := NewHandler(store)

	body := `{"title": "New title", "completed": true}`
	req := httptest.NewRequest(http.MethodPut, "/api/todos/"+todo.ID, bytes.NewBufferString(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var updated Todo
	json.NewDecoder(w.Body).Decode(&updated)
	if updated.Title != "New title" {
		t.Errorf("expected title 'New title', got '%s'", updated.Title)
	}
	if !updated.Completed {
		t.Error("expected completed to be true")
	}
}

func TestHandleDeleteNotFound(t *testing.T) {
	store := NewTodoStore()
	handler := NewHandler(store)

	req := httptest.NewRequest(http.MethodDelete, "/api/todos/nonexistent", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected status 404, got %d", w.Code)
	}
}
