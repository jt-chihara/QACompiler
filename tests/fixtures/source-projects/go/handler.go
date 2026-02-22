package main

import "fmt"

// HandleCreate creates a new item
func HandleCreate(name string) error {
	fmt.Println("Creating:", name)
	return nil
}

// HandleList lists all items
func HandleList() ([]string, error) {
	return []string{}, nil
}

type TodoItem struct {
	ID   int
	Name string
	Done bool
}

type Repository interface {
	Save(item TodoItem) error
	FindAll() ([]TodoItem, error)
}

// unexported function
func validate(name string) bool {
	return len(name) > 0
}
