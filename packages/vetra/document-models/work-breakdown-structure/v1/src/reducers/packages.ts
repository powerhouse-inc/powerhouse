import type { WorkBreakdownStructurePackagesOperations } from "document-models/work-breakdown-structure/v1";
import {
  DuplicatePackageIdError,
  PackageNestingTooDeepError,
  PackageNotFoundError,
} from "../../gen/packages/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const workBreakdownStructurePackagesOperations: WorkBreakdownStructurePackagesOperations =
  {
    addPackageOperation(state, action) {
      if (state.packages.some((p) => p.id === action.input.id)) {
        throw new DuplicatePackageIdError(
          `Package ${action.input.id} already exists.`,
        );
      }
      if (action.input.parentPackageId) {
        const parent = state.packages.find(
          (p) => p.id === action.input.parentPackageId,
        );
        if (!parent) {
          throw new PackageNotFoundError(
            `Parent package ${action.input.parentPackageId} not found.`,
          );
        }
        if (parent.parentPackageId) {
          throw new PackageNestingTooDeepError(
            "Packages may nest at most one level deep.",
          );
        }
      }
      insertItem(
        state.packages,
        {
          id: action.input.id,
          parentPackageId: action.input.parentPackageId ?? null,
          name: action.input.name,
          description: action.input.description ?? null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updatePackageOperation(state, action) {
      const pkg = state.packages.find((p) => p.id === action.input.id);
      if (!pkg) {
        throw new PackageNotFoundError(`Package ${action.input.id} not found.`);
      }
      if (action.input.name) pkg.name = action.input.name;
      if (action.input.description) pkg.description = action.input.description;
    },
    movePackageOperation(state, action) {
      const pkg = state.packages.find((p) => p.id === action.input.id);
      if (!pkg) {
        throw new PackageNotFoundError(`Package ${action.input.id} not found.`);
      }
      if (action.input.parentPackageId) {
        const parent = state.packages.find(
          (p) => p.id === action.input.parentPackageId,
        );
        if (!parent) {
          throw new PackageNotFoundError(
            `Parent package ${action.input.parentPackageId} not found.`,
          );
        }
        if (parent.parentPackageId) {
          throw new PackageNestingTooDeepError(
            "Packages may nest at most one level deep.",
          );
        }
        if (state.packages.some((p) => p.parentPackageId === pkg.id)) {
          throw new PackageNestingTooDeepError(
            "Cannot nest a package that has sub-packages.",
          );
        }
        pkg.parentPackageId = action.input.parentPackageId;
      } else {
        pkg.parentPackageId = null;
      }
    },
    removePackageOperation(state, action) {
      const index = state.packages.findIndex((p) => p.id === action.input.id);
      if (index === -1) {
        throw new PackageNotFoundError(`Package ${action.input.id} not found.`);
      }
      for (const p of state.packages) {
        if (p.parentPackageId === action.input.id) p.parentPackageId = null;
      }
      for (const t of state.tasks) {
        if (t.packageId === action.input.id) t.packageId = null;
      }
      state.packages.splice(index, 1);
    },
    reorderPackagesOperation(state, action) {
      for (const id of action.input.ids) {
        if (!state.packages.some((p) => p.id === id)) {
          throw new PackageNotFoundError(`Package ${id} not found.`);
        }
      }
      reorderById(
        state.packages,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
  };
