/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { Todo } from "../module.js";
import type { TodoAction, TodoPHState } from "./types.js";

export const TodoController = PHDocumentController.forDocumentModel<
  TodoPHState,
  TodoAction
>(Todo);
