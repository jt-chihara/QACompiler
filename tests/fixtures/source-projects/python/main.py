"""Main module for the application."""


class TodoService:
    """Service for managing todos."""

    def __init__(self):
        self.todos = []

    def add_todo(self, title: str) -> dict:
        todo = {"id": len(self.todos) + 1, "title": title, "done": False}
        self.todos.append(todo)
        return todo

    def list_todos(self) -> list:
        return self.todos


def create_app():
    """Create and configure the application."""
    return TodoService()


def _internal_helper():
    """Not a public function."""
    pass
