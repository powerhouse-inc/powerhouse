import { generateId } from "document-model/core";
import type { TodoListTodosOperations } from "@powerhousedao/todo-demo/document-models/todo-list";

export const todoListTodosOperations: TodoListTodosOperations = {
  addTodoItemOperation(state, action) {
    const id = generateId();
    state.items.push({ ...action.input, id, checked: false });
  },
  updateTodoItemOperation(state, action) {
    const item = state.items.find((item) => item.id === action.input.id);
    if (!item) return;
    item.text = action.input.text ?? item.text;
    item.checked = action.input.checked ?? item.checked;
  },
  deleteTodoItemOperation(state, action) {
    state.items = state.items.filter((item) => item.id !== action.input.id);
  },
};
