import type { TodoTodoOperationsOperations } from "versioned-documents/document-models/todo/v2";

export const todoTodoOperationsOperations: TodoTodoOperationsOperations = {
  addTodoOperation(state, action) {
    state.todos.push({
      id: action.input.id,
      title: action.input.title,
      completed: action.input.completed,
    });
  },
  removeTodoOperation(state, action) {
    const index = state.todos.findIndex((t) => t.id === action.input.id);
    if (index !== -1) {
      state.todos.splice(index, 1);
    }
  },
  updateTodoOperation(state, action) {
    const todo = state.todos.find((t) => t.id === action.input.id);
    if (todo) {
      if (action.input.title != null) todo.title = action.input.title;
      if (action.input.completed != null)
        todo.completed = action.input.completed;
    }
  },
  editTitleOperation(state, action) {
    state.title = action.input.title || null;
  },
};
