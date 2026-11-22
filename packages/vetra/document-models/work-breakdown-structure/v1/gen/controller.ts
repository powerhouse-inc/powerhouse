/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { PHDocumentController } from "document-model";
import { WorkBreakdownStructure } from "../module.js";
import type {
  WorkBreakdownStructureAction,
  WorkBreakdownStructurePHState,
} from "./types.js";

export const WorkBreakdownStructureController =
  PHDocumentController.forDocumentModel<
    WorkBreakdownStructurePHState,
    WorkBreakdownStructureAction
  >(WorkBreakdownStructure);
