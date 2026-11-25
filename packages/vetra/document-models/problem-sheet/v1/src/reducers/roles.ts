import type { ProblemSheetRolesOperations } from "document-models/problem-sheet/v1";
import {
  DuplicateRoleIdError,
  DuplicateSpecializedJobStepIdError,
  RoleNotFoundError,
  SpecializedJobNotSetError,
  SpecializedJobStepNotFoundError,
} from "../../gen/roles/error.js";
import { insertItem, reorderById } from "../reorder.js";

export const problemSheetRolesOperations: ProblemSheetRolesOperations = {
  addRoleOperation(state, action) {
    if (state.roles.some((r) => r.id === action.input.id)) {
      throw new DuplicateRoleIdError(`Role ${action.input.id} already exists.`);
    }
    insertItem(
      state.roles,
      {
        id: action.input.id,
        name: action.input.name,
        kind: action.input.kind,
        description: action.input.description ?? null,
        context: action.input.context ?? null,
        specializedJob: null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateRoleOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.id);
    if (!role)
      throw new RoleNotFoundError(`Role ${action.input.id} not found.`);
    if (action.input.name) role.name = action.input.name;
    if (action.input.kind) role.kind = action.input.kind;
    if (action.input.description) role.description = action.input.description;
    if (action.input.context) role.context = action.input.context;
  },
  removeRoleOperation(state, action) {
    const index = state.roles.findIndex((r) => r.id === action.input.id);
    if (index === -1) {
      throw new RoleNotFoundError(`Role ${action.input.id} not found.`);
    }
    state.roles.splice(index, 1);
  },
  reorderRolesOperation(state, action) {
    for (const id of action.input.ids) {
      if (!state.roles.some((r) => r.id === id)) {
        throw new RoleNotFoundError(`Role ${id} not found.`);
      }
    }
    reorderById(
      state.roles,
      action.input.ids,
      action.input.insertBefore ?? null,
    );
  },
  setRoleSpecializedJobOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    role.specializedJob = {
      motivation: action.input.motivation,
      verb: action.input.verb,
      object: action.input.object,
      clarifier: action.input.clarifier ?? null,
      steps: [],
    };
  },
  updateRoleSpecializedJobOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    if (!role.specializedJob) {
      throw new SpecializedJobNotSetError(
        `Role ${action.input.roleId} has no specialized job.`,
      );
    }
    if (action.input.motivation) {
      role.specializedJob.motivation = action.input.motivation;
    }
    if (action.input.verb) role.specializedJob.verb = action.input.verb;
    if (action.input.object) role.specializedJob.object = action.input.object;
    if (action.input.clarifier) {
      role.specializedJob.clarifier = action.input.clarifier;
    }
  },
  clearRoleSpecializedJobOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    role.specializedJob = null;
  },
  addSpecializedJobStepOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    if (!role.specializedJob) {
      throw new SpecializedJobNotSetError(
        `Role ${action.input.roleId} has no specialized job.`,
      );
    }
    if (role.specializedJob.steps.some((s) => s.id === action.input.id)) {
      throw new DuplicateSpecializedJobStepIdError(
        `Step ${action.input.id} already exists.`,
      );
    }
    insertItem(
      role.specializedJob.steps,
      {
        id: action.input.id,
        name: action.input.name,
        category: action.input.category,
        description: action.input.description ?? null,
      },
      action.input.insertBefore ?? null,
    );
  },
  updateSpecializedJobStepOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    if (!role.specializedJob) {
      throw new SpecializedJobNotSetError(
        `Role ${action.input.roleId} has no specialized job.`,
      );
    }
    const step = role.specializedJob.steps.find(
      (s) => s.id === action.input.id,
    );
    if (!step) {
      throw new SpecializedJobStepNotFoundError(
        `Step ${action.input.id} not found.`,
      );
    }
    if (action.input.name) step.name = action.input.name;
    if (action.input.category) step.category = action.input.category;
    if (action.input.description) step.description = action.input.description;
  },
  removeSpecializedJobStepOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    if (!role.specializedJob) {
      throw new SpecializedJobNotSetError(
        `Role ${action.input.roleId} has no specialized job.`,
      );
    }
    const index = role.specializedJob.steps.findIndex(
      (s) => s.id === action.input.id,
    );
    if (index === -1) {
      throw new SpecializedJobStepNotFoundError(
        `Step ${action.input.id} not found.`,
      );
    }
    role.specializedJob.steps.splice(index, 1);
  },
  reorderSpecializedJobStepsOperation(state, action) {
    const role = state.roles.find((r) => r.id === action.input.roleId);
    if (!role) {
      throw new RoleNotFoundError(`Role ${action.input.roleId} not found.`);
    }
    if (!role.specializedJob) {
      throw new SpecializedJobNotSetError(
        `Role ${action.input.roleId} has no specialized job.`,
      );
    }
    const steps = role.specializedJob.steps;
    for (const id of action.input.ids) {
      if (!steps.some((s) => s.id === id)) {
        throw new SpecializedJobStepNotFoundError(`Step ${id} not found.`);
      }
    }
    reorderById(steps, action.input.ids, action.input.insertBefore ?? null);
  },
};
