import type { TodoTodoOperations } from "document-models/todo/v2";

export const todoTodoOperations: TodoTodoOperations = {
  addItemOperation(state, action) {
    state.items.push({
      id: action.input.id,
      title: action.input.title,
      status: "TODO",
      priority: action.input.priority ?? 0,
    });
  },
  // Legacy operation retained from v1. The latest reducer owns the whole
  // history: replay folds every recorded operation — including v1-era
  // CHECK_ITEM ops — through this v2 reducer, so this case must map the old
  // `checked` boolean onto the new `status` field or replay diverges.
  checkItemOperation(state, action) {
    const item = state.items.find((i) => i.id === action.input.id);
    if (item) item.status = action.input.checked ? "DONE" : "TODO";
  },
  setStatusOperation(state, action) {
    const item = state.items.find((i) => i.id === action.input.id);
    if (item) item.status = action.input.status;
  },
  setPriorityOperation(state, action) {
    const item = state.items.find((i) => i.id === action.input.id);
    if (item) item.priority = action.input.priority;
  },
};
