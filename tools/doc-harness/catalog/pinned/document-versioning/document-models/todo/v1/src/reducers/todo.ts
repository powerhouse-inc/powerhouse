import type { TodoTodoOperations } from "document-models/todo/v1";

export const todoTodoOperations: TodoTodoOperations = {
  addItemOperation(state, action) {
    state.items.push({
      id: action.input.id,
      title: action.input.title,
      checked: false,
    });
  },
  checkItemOperation(state, action) {
    const item = state.items.find((i) => i.id === action.input.id);
    if (item) item.checked = action.input.checked;
  },
};
