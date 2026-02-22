package main

import (
	"fmt"
	"log"
	"net/http"
)

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	store := NewTodoStore()
	handler := NewHandler(store)

	mux := http.NewServeMux()
	mux.Handle("/api/todos", handler)
	mux.Handle("/api/todos/", handler)

	port := 8080
	log.Printf("Server starting on :%d", port)
	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), corsMiddleware(mux)); err != nil {
		log.Fatal(err)
	}
}
