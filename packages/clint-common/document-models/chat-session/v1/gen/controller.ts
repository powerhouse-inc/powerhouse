/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { ChatSession } from "../module.js";
import type { ChatSessionAction, ChatSessionPHState } from "./types.js";

export const ChatSessionController = PHDocumentController.forDocumentModel<
  ChatSessionPHState,
  ChatSessionAction
>(ChatSession);
