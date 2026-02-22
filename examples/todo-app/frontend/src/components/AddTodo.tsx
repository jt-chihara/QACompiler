import { useState } from "react";

interface Props {
  onAdd: (title: string) => void;
}

export function AddTodo({ onAdd }: Props) {
  const [title, setTitle] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setTitle("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="新しいTODOを入力..."
        style={{ flex: 1, padding: 8 }}
      />
      <button type="submit" style={{ padding: "8px 16px" }}>
        追加
      </button>
    </form>
  );
}
