package main

import (
	"fmt"
	"sync"
	"time"
)

type Todo struct {
	ID        string    `json:"id"`
	Title     string    `json:"title"`
	Completed bool      `json:"completed"`
	CreatedAt time.Time `json:"created_at"`
}

type TodoStore struct {
	mu    sync.RWMutex
	todos map[string]Todo
	seq   int
}

func NewTodoStore() *TodoStore {
	return &TodoStore{
		todos: make(map[string]Todo),
	}
}

func (s *TodoStore) Create(title string) Todo {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.seq++
	id := fmt.Sprintf("todo-%d", s.seq)

	todo := Todo{
		ID:        id,
		Title:     title,
		Completed: false,
		CreatedAt: time.Now(),
	}
	s.todos[id] = todo
	return todo
}

func (s *TodoStore) List() []Todo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]Todo, 0, len(s.todos))
	for _, t := range s.todos {
		result = append(result, t)
	}
	return result
}

func (s *TodoStore) Get(id string) (Todo, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	t, ok := s.todos[id]
	return t, ok
}

func (s *TodoStore) Update(id string, title string, completed bool) (Todo, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	t, ok := s.todos[id]
	if !ok {
		return Todo{}, false
	}

	t.Title = title
	t.Completed = completed
	s.todos[id] = t
	return t, true
}

func (s *TodoStore) Delete(id string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	_, ok := s.todos[id]
	if ok {
		delete(s.todos, id)
	}
	return ok
}
