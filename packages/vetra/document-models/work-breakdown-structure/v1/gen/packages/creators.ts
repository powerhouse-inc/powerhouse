/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { createAction } from "document-model";
import {
  AddPackageInputSchema,
  MovePackageInputSchema,
  RemovePackageInputSchema,
  ReorderPackagesInputSchema,
  UpdatePackageInputSchema,
} from "../schema/zod.js";
import type {
  AddPackageInput,
  MovePackageInput,
  RemovePackageInput,
  ReorderPackagesInput,
  UpdatePackageInput,
} from "../types.js";
import type {
  AddPackageAction,
  MovePackageAction,
  RemovePackageAction,
  ReorderPackagesAction,
  UpdatePackageAction,
} from "./actions.js";

export const addPackage = (input: AddPackageInput) =>
  createAction<AddPackageAction>(
    "ADD_PACKAGE",
    { ...input },
    undefined,
    AddPackageInputSchema,
    "global",
  );

export const updatePackage = (input: UpdatePackageInput) =>
  createAction<UpdatePackageAction>(
    "UPDATE_PACKAGE",
    { ...input },
    undefined,
    UpdatePackageInputSchema,
    "global",
  );

export const movePackage = (input: MovePackageInput) =>
  createAction<MovePackageAction>(
    "MOVE_PACKAGE",
    { ...input },
    undefined,
    MovePackageInputSchema,
    "global",
  );

export const removePackage = (input: RemovePackageInput) =>
  createAction<RemovePackageAction>(
    "REMOVE_PACKAGE",
    { ...input },
    undefined,
    RemovePackageInputSchema,
    "global",
  );

export const reorderPackages = (input: ReorderPackagesInput) =>
  createAction<ReorderPackagesAction>(
    "REORDER_PACKAGES",
    { ...input },
    undefined,
    ReorderPackagesInputSchema,
    "global",
  );
