import { useState, useEffect } from "react";
import { fetchTodos, createTodo, updateTodo, deleteTodo } from "./api";
import { TodoList } from "./components/TodoList";
import { AddTodo } from "./components/AddTodo";
import type { Todo } from "./types";

export default function App() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTodos()
      .then(setTodos)
      .catch(() => setError("TODOの読み込みに失敗しました"));
  }, []);

  const handleAdd = async (title: string) => {
    try {
      const todo = await createTodo(title);
      setTodos((prev) => [...prev, todo]);
    } catch {
      setError("TODOの追加に失敗しました");
    }
  };

  const handleToggle = async (id: string) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;
    try {
      const updated = await updateTodo(id, todo.title, !todo.completed);
      setTodos((prev) => prev.map((t) => (t.id === id ? updated : t)));
    } catch {
      setError("TODOの更新に失敗しました");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTodo(id);
      setTodos((prev) => prev.filter((t) => t.id !== id));
    } catch {
      setError("TODOの削除に失敗しました");
    }
  };

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1>TODO App</h1>
      {error && (
        <div style={{ color: "red", marginBottom: 10 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>
            ✕
          </button>
        </div>
      )}
      <AddTodo onAdd={handleAdd} />
      <TodoList
        todos={todos}
        onToggle={handleToggle}
        onDelete={handleDelete}
      />
    </div>
  );
}
