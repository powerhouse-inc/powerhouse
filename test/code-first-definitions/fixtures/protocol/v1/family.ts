import {
  baseActions,
  createAction,
  createReducer,
  defineDocumentModel,
  defineDocumentModelFamily,
  DocumentModelDefinitionError,
  isDocumentAction,
  ph,
  type Action,
  type DocumentModelModule,
  type PHBaseState,
  type PHDocument,
  type SignalDispatch,
  type StateReducer,
  type UpgradeManifest,
  type UpgradeTransition,
} from "document-model";
import { LegacyDocumentModelModuleAdapter } from "document-model/tooling";
import { parse } from "graphql";
import { z } from "zod";

export type ProtocolImplementation = "legacy" | "code-first";

type RuntimeProbe = {
  readonly errorCodes: string[];
};

const runtimeProbes: Record<ProtocolImplementation, RuntimeProbe> = {
  legacy: { errorCodes: [] },
  "code-first": { errorCodes: [] },
};

function recordErrorCode(
  implementation: ProtocolImplementation,
  error: Error & { readonly errorCode?: unknown },
): void {
  runtimeProbes[implementation].errorCodes.push(String(error.errorCode));
}

export function resetProtocolRuntimeProbe(
  implementation: ProtocolImplementation,
): void {
  runtimeProbes[implementation].errorCodes.length = 0;
}

export function readProtocolRuntimeProbe(
  implementation: ProtocolImplementation,
): RuntimeProbe {
  return {
    errorCodes: [...runtimeProbes[implementation].errorCodes],
  };
}

function requireScopeState<T>(state: T | undefined): T {
  if (state === undefined) throw new Error("missing protocol scope");
  return state;
}

function createCodeFirstV1() {
  const ProtocolState = ph.object("ProtocolState", {
    fields: {
      counter: ph.Int({ required: true }),
      events: ph.list(ph.String({ required: true }), { required: true }),
    },
  });
  const ProtocolLocalState = ph.object("ProtocolLocalState", {
    fields: {
      counter: ph.Int({ required: true }),
      draft: ph.String({ required: true }),
      events: ph.list(ph.String({ required: true }), { required: true }),
    },
  });
  const model = defineDocumentModel({
    id: "powerhouse/protocol-matrix",
    name: "Protocol",
    description: "Deterministic document protocol parity fixture.",
    extension: "ph-protocol",
    version: 1,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ProtocolState,
        initialValue: { counter: 0, events: [] },
      },
      local: {
        schema: ProtocolLocalState,
        initialValue: { counter: 0, draft: "", events: [] },
      },
    },
  });
  const operations = model.module("protocol", {
    operations: ({ global, local }) => ({
      increment: global({
        input: ph.input({
          fields: {
            amount: ph.Int({ required: true }),
            tag: ph.String(),
          },
        }),
        reduce(state, input) {
          const target = requireScopeState(state);
          target.counter += input.amount;
          target.events.push(
            `${input.tag ?? "untagged"}:${Object.hasOwn(input, "extra") ? String((input as Record<string, unknown>).extra) : "no-extra"}`,
          );
        },
      }),
      setDraft: local({
        input: ph.input({
          fields: { draft: ph.String({ required: true }) },
        }),
        reduce(state, input) {
          const target = requireScopeState(state);
          target.draft = input.draft;
          target.events.push(`draft:${input.draft}`);
        },
      }),
      fail: global({
        input: ph.input({
          fields: { explicit: ph.Boolean({ required: true }) },
        }),
        errors: {
          Rejected: {
            code: "STORED_REJECTION",
            name: "Rejected",
            description: "A deterministic fixture rejection.",
            template: null,
          },
        },
        reduce(_state, input, context) {
          const error = input.explicit
            ? new context.errors.Rejected("explicit rejection")
            : new context.errors.Rejected();
          recordErrorCode("code-first", error);
          throw error;
        },
      }),
      emit: global({
        input: ph.input({
          fields: { id: ph.String({ required: true }) },
        }),
        reduce(state, input, context) {
          const target = requireScopeState(state);
          target.events.push(`dispatch:${input.id}`);
          context.dispatch?.({
            type: "DELETE_CHILD_DOCUMENT",
            input: { id: input.id },
          });
        },
      }),
      observeContext: global({
        input: ph.input({
          fields: {
            evaluationOrdinal: ph.Int({ required: true }),
            marker: ph.String({ required: true }),
          },
        }),
        reduce(state, input, context) {
          const target = requireScopeState(state);
          target.events.push(
            `${input.marker}:ordinal-${input.evaluationOrdinal}:prev-${context.action.context?.prevOpIndex ?? "none"}`,
          );
        },
      }),
    }),
  });
  return model.version({ modules: [operations] });
}

function createCodeFirstV2() {
  const ProtocolState = ph.object("ProtocolState", {
    fields: {
      counter: ph.Int({ required: true }),
      events: ph.list(ph.String({ required: true }), { required: true }),
      title: ph.String(),
    },
  });
  const ProtocolLocalState = ph.object("ProtocolLocalState", {
    fields: {
      counter: ph.Int({ required: true }),
      draft: ph.String({ required: true }),
      events: ph.list(ph.String({ required: true }), { required: true }),
    },
  });
  const model = defineDocumentModel({
    id: "powerhouse/protocol-matrix",
    name: "Protocol",
    description: "Deterministic document protocol parity fixture.",
    extension: "ph-protocol",
    version: 2,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ProtocolState,
        initialValue: { counter: 0, events: [], title: null },
      },
      local: {
        schema: ProtocolLocalState,
        initialValue: { counter: 0, draft: "", events: [] },
      },
    },
  });
  const operations = model.module("protocol", {
    operations: ({ global, local }) => ({
      increment: global({
        input: ph.input({
          fields: {
            amount: ph.Int({ required: true }),
            tag: ph.String(),
          },
        }),
        reduce(state, input) {
          const target = requireScopeState(state);
          target.counter += input.amount;
          target.events.push(
            `${input.tag ?? "untagged"}:${Object.hasOwn(input, "extra") ? String((input as Record<string, unknown>).extra) : "no-extra"}`,
          );
        },
      }),
      setDraft: local({
        input: ph.input({
          fields: { draft: ph.String({ required: true }) },
        }),
        reduce(state, input) {
          const target = requireScopeState(state);
          target.draft = input.draft;
          target.events.push(`draft:${input.draft}`);
        },
      }),
      fail: global({
        input: ph.input({
          fields: { explicit: ph.Boolean({ required: true }) },
        }),
        errors: {
          Rejected: {
            code: "STORED_REJECTION",
            name: "Rejected",
            description: "A deterministic fixture rejection.",
            template: null,
          },
        },
        reduce(_state, input, context) {
          const error = input.explicit
            ? new context.errors.Rejected("explicit rejection")
            : new context.errors.Rejected();
          recordErrorCode("code-first", error);
          throw error;
        },
      }),
      emit: global({
        input: ph.input({
          fields: { id: ph.String({ required: true }) },
        }),
        reduce(state, input, context) {
          const target = requireScopeState(state);
          target.events.push(`dispatch:${input.id}`);
          context.dispatch?.({
            type: "DELETE_CHILD_DOCUMENT",
            input: { id: input.id },
          });
        },
      }),
      observeContext: global({
        input: ph.input({
          fields: {
            evaluationOrdinal: ph.Int({ required: true }),
            marker: ph.String({ required: true }),
          },
        }),
        reduce(state, input, context) {
          const target = requireScopeState(state);
          target.events.push(
            `${input.marker}:ordinal-${input.evaluationOrdinal}:prev-${context.action.context?.prevOpIndex ?? "none"}`,
          );
        },
      }),
      setTitle: global({
        input: ph.input({
          fields: { title: ph.String({ required: true }) },
        }),
        reduce(state, input) {
          requireScopeState(state).title = input.title;
        },
      }),
    }),
  });
  return model.version({ modules: [operations] });
}

function upgradeToV2<TState extends PHBaseState>(
  document: PHDocument<TState>,
): PHDocument<TState> {
  return {
    ...document,
    state: {
      ...document.state,
      global: {
        ...((document.state as Record<string, unknown>).global as Record<
          string,
          unknown
        >),
        title: null,
      },
    } as TState,
    initialState: {
      ...document.initialState,
      global: {
        ...((document.initialState as Record<string, unknown>).global as Record<
          string,
          unknown
        >),
        title: null,
      },
    } as TState,
  };
}

const codeFirstUpgrade: UpgradeTransition = {
  toVersion: 2,
  description: "Adds the nullable protocol title.",
  upgradeReducer: upgradeToV2,
};

export const CodeFirstProtocolFamily = defineDocumentModelFamily({
  versions: [createCodeFirstV1(), createCodeFirstV2()],
  upgrades: [codeFirstUpgrade],
});

export const CodeFirstProtocolV1 = CodeFirstProtocolFamily.at(1);
export const CodeFirstProtocolV2 = CodeFirstProtocolFamily.at(2);

const incrementInputSchema = () =>
  z.object({ amount: z.number().int(), tag: z.string().nullish() });
const setDraftInputSchema = () => z.object({ draft: z.string() });
const failInputSchema = () => z.object({ explicit: z.boolean() });
const emitInputSchema = () => z.object({ id: z.string() });
const observeContextInputSchema = () =>
  z.object({ evaluationOrdinal: z.number().int(), marker: z.string() });
const setTitleInputSchema = () => z.object({ title: z.string() });

class LegacyRejectedError extends Error {
  readonly errorCode = "Rejected";

  constructor(message = "Rejected") {
    super(message);
  }
}

function legacyActions(version: 1 | 2) {
  return {
    ...baseActions,
    increment(input: Record<string, unknown>) {
      return createAction(
        "INCREMENT",
        { ...input },
        undefined,
        incrementInputSchema,
        "global",
      );
    },
    setDraft(input: Record<string, unknown>) {
      return createAction(
        "SET_DRAFT",
        { ...input },
        undefined,
        setDraftInputSchema,
        "local",
      );
    },
    fail(input: Record<string, unknown>) {
      return createAction(
        "FAIL",
        { ...input },
        undefined,
        failInputSchema,
        "global",
      );
    },
    emit(input: Record<string, unknown>) {
      return createAction(
        "EMIT",
        { ...input },
        undefined,
        emitInputSchema,
        "global",
      );
    },
    observeContext(input: Record<string, unknown>) {
      return createAction(
        "OBSERVE_CONTEXT",
        { ...input },
        undefined,
        observeContextInputSchema,
        "global",
      );
    },
    ...(version === 2
      ? {
          setTitle(input: Record<string, unknown>) {
            return createAction(
              "SET_TITLE",
              { ...input },
              undefined,
              setTitleInputSchema,
              "global",
            );
          },
        }
      : {}),
  };
}

function legacyStateReducer(version: 1 | 2): StateReducer<PHBaseState> {
  return (state, action: Action, dispatch?: SignalDispatch) => {
    if (isDocumentAction(action)) return state;
    const input = action.input as Record<string, unknown>;
    const target = (state as Record<string, unknown>)[action.scope] as
      | Record<string, unknown>
      | undefined;
    switch (action.type) {
      case "INCREMENT": {
        incrementInputSchema().parse(action.input);
        const scopeState = requireScopeState(target);
        scopeState.counter = Number(scopeState.counter) + Number(input.amount);
        (scopeState.events as string[]).push(
          `${input.tag ?? "untagged"}:${Object.hasOwn(input, "extra") ? String(input.extra) : "no-extra"}`,
        );
        break;
      }
      case "SET_DRAFT": {
        setDraftInputSchema().parse(action.input);
        const scopeState = requireScopeState(target);
        scopeState.draft = input.draft;
        (scopeState.events as string[]).push(`draft:${String(input.draft)}`);
        break;
      }
      case "FAIL": {
        failInputSchema().parse(action.input);
        const error = new LegacyRejectedError(
          input.explicit ? "explicit rejection" : undefined,
        );
        recordErrorCode("legacy", error);
        throw error;
      }
      case "EMIT": {
        emitInputSchema().parse(action.input);
        const scopeState = requireScopeState(target);
        (scopeState.events as string[]).push(`dispatch:${String(input.id)}`);
        dispatch?.({
          type: "DELETE_CHILD_DOCUMENT",
          input: { id: String(input.id) },
        });
        break;
      }
      case "OBSERVE_CONTEXT": {
        observeContextInputSchema().parse(action.input);
        const scopeState = requireScopeState(target);
        (scopeState.events as string[]).push(
          `${String(input.marker)}:ordinal-${String(input.evaluationOrdinal)}:prev-${action.context?.prevOpIndex ?? "none"}`,
        );
        break;
      }
      case "SET_TITLE": {
        if (version !== 2) return state;
        setTitleInputSchema().parse(action.input);
        requireScopeState(target).title = input.title;
        break;
      }
      default:
        return state;
    }
    return undefined;
  };
}

function legacyModule(
  source: typeof CodeFirstProtocolV1 | typeof CodeFirstProtocolV2,
  version: 1 | 2,
): DocumentModelModule {
  const { definition: _definition, ...sharedModuleShape } = source;
  return {
    ...sharedModuleShape,
    version,
    actions: legacyActions(version),
    reducer: createReducer(legacyStateReducer(version)),
  } as unknown as DocumentModelModule;
}

export const LegacyProtocolV1 = legacyModule(CodeFirstProtocolV1, 1);
export const LegacyProtocolV2 = legacyModule(CodeFirstProtocolV2, 2);

const legacyUpgrade: UpgradeTransition = {
  toVersion: 2,
  description: "Adds the nullable protocol title.",
  upgradeReducer: upgradeToV2,
};

export const LegacyProtocolUpgradeManifest: UpgradeManifest<readonly [1, 2]> = {
  documentType: "powerhouse/protocol-matrix",
  latestVersion: 2,
  supportedVersions: [1, 2],
  upgrades: { v2: legacyUpgrade },
};

export const LegacyProtocolFamily = {
  modules: [LegacyProtocolV1, LegacyProtocolV2] as const,
  upgradeManifest: LegacyProtocolUpgradeManifest,
  at(version: 1 | 2) {
    const module = this.modules.find(
      (candidate) => candidate.version === version,
    );
    if (!module) throw new RangeError(`No legacy protocol version ${version}.`);
    return module;
  },
};

function diagnosticCode(error: unknown): string {
  if (error instanceof DocumentModelDefinitionError) {
    return error.diagnostics[0]?.code ?? error.name;
  }
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return error instanceof Error ? error.name : String(error);
}

function probeCodeFirstDuplicateAction(): string {
  try {
    const model = defineDocumentModel({
      id: "powerhouse/protocol-collision",
      name: "Collision",
      description: "Duplicate action diagnostic fixture.",
      extension: "collision",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("CollisionState", {
            fields: { value: ph.Int({ required: true }) },
          }),
          initialValue: { value: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    const first = model.module("first", {
      operations: ({ global }) => ({
        sameAction: global({
          input: ph.input({ fields: { value: ph.Int({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    const second = model.module("second", {
      operations: ({ global }) => ({
        same_action: global({
          input: ph.input({ fields: { value: ph.Int({ required: true }) } }),
          reduce() {},
        }),
      }),
    });
    model.finalize({ modules: [first, second] });
    return "accepted";
  } catch (error) {
    return diagnosticCode(error);
  }
}

function probeLegacyDuplicateAction(): string {
  const documentModel = JSON.parse(
    JSON.stringify(LegacyProtocolV1.documentModel),
  ) as typeof LegacyProtocolV1.documentModel;
  const specification = documentModel.global.specifications[0];
  const firstOperation = specification?.modules[0]?.operations[0];
  if (!specification || !firstOperation) return "fixture-invalid";
  specification.modules.push({
    id: "legacy-duplicate-module",
    name: "duplicate_module",
    description: "",
    operations: [
      {
        ...firstOperation,
        id: "legacy-duplicate-operation",
      },
    ],
  });
  try {
    new LegacyDocumentModelModuleAdapter({ parse }).adapt({
      ...LegacyProtocolV1,
      documentModel,
    });
    return "accepted";
  } catch (error) {
    return diagnosticCode(error);
  }
}

function probeNoInputDeclaration(): string {
  try {
    const model = defineDocumentModel({
      id: "powerhouse/protocol-no-input",
      name: "No Input",
      description: "No-input diagnostic fixture.",
      extension: "no-input",
      version: 1,
      author: { name: "Powerhouse" },
      specifications: {
        global: {
          schema: ph.object("NoInputState", {
            fields: { value: ph.Int({ required: true }) },
          }),
          initialValue: { value: 0 },
        },
        local: { schema: null, initialValue: {} },
      },
    });
    model.module("no_input", {
      operations: ({ global }: { global: unknown }) => ({
        noInput: (global as unknown as (value: unknown) => unknown)({
          input: null,
          reduce() {},
        }),
      }),
    } as never);
    return "accepted";
  } catch (error) {
    return diagnosticCode(error);
  }
}

export function probeProtocolDefinitionDiagnostics() {
  return {
    duplicateAction: {
      legacy: probeLegacyDuplicateAction(),
      codeFirst: probeCodeFirstDuplicateAction(),
    },
    noInput: {
      codeFirst: probeNoInputDeclaration(),
    },
  };
}

export function storedProtocolErrorCode(module: DocumentModelModule): string {
  const operation = module.documentModel.global.specifications
    .find((specification) => specification.version === module.version)
    ?.modules.flatMap((candidate) => candidate.operations)
    .find((candidate) => candidate.name?.toUpperCase() === "FAIL");
  return operation?.errors[0]?.code ?? "missing";
}
