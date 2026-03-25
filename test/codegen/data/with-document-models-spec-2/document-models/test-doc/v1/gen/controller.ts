import { PHDocumentController } from "document-model";
import { TestDoc } from "../module.js";
import type { TestDocAction, TestDocPHState } from "./types.js";

export const TestDocController = PHDocumentController.forDocumentModel<
  TestDocPHState,
  TestDocAction
>(TestDoc);
