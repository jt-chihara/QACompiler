import type { Todo } from "../types";

interface Props {
  todo: Todo;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onDelete }: Props) {
  return (
    <li style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={() => onToggle(todo.id)}
      />
      <span style={{ flex: 1, textDecoration: todo.completed ? "line-through" : "none" }}>
        {todo.title}
      </span>
      <button onClick={() => onDelete(todo.id)} style={{ color: "red" }}>
        削除
      </button>
    </li>
  );
}
