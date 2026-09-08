import type { InputOf, Mutable, SourceOf } from "document-model";
import type {
  addCodeFirstTodoInput,
  codeFirstTodoStateSchema,
  renameCodeFirstListInput,
  toggleCodeFirstTodoInput,
} from "./model.js";

type GlobalState = Mutable<SourceOf<typeof codeFirstTodoStateSchema>>;
type AddCodeFirstTodoInput = Mutable<InputOf<typeof addCodeFirstTodoInput>>;
type ToggleCodeFirstTodoInput = Mutable<
  InputOf<typeof toggleCodeFirstTodoInput>
>;
type RenameCodeFirstListInput = Mutable<
  InputOf<typeof renameCodeFirstListInput>
>;

export function addCodeFirstTodoReducer(
  state: GlobalState,
  input: AddCodeFirstTodoInput,
): void {
  state.todos.push({ ...input, completed: false });
}

export function toggleCodeFirstTodoReducer(
  state: GlobalState,
  input: ToggleCodeFirstTodoInput,
): void {
  const todo = state.todos.find((item) => item.id === input.id);
  if (todo) todo.completed = !todo.completed;
}

export function renameCodeFirstListReducer(
  state: GlobalState,
  input: RenameCodeFirstListInput,
): void {
  state.listName = input.name;
}
