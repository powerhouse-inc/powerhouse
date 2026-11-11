import type {
  Capability,
  Condition,
  DefinitionDiagnostic,
  InitialAuthBindingDefinition,
  InitialAuthTemplate,
  InitialAuthTemplateGrant,
  Operand,
  Principal,
} from "@powerhousedao/shared/document-model";
import {
  authAddress,
  authGroupId,
  compileInitialAuthTemplate,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import {
  fieldSchemas,
  isPrimitiveSchema,
  acceptsPrimitive,
  requiresPrimitiveRepresentation,
  scalarRepresentationsFor,
} from "./schema.js";
import { validateInitialAuthSpecification } from "./wire.js";
import { authPlatformScopes, authPlatformState } from "./platform.js";
import type { CompiledDocumentModelVersion } from "../compiler/compile.js";
import { compilerDiagnostics } from "../compiler/diagnostic-codes.js";
import { snapshotArray, snapshotRecord } from "../kernel/data-properties.js";

interface OperationData {
  scope: string;
  actionType: string;
  input: z.ZodType;
}
interface TargetData {
  capability: Capability;
  scope: string;
  input?: z.ZodType;
}
interface ValueData {
  operand: Operand;
  validator: z.ZodType;
  primitive: boolean;
  requiresRepresentation: boolean;
  context: object;
}
interface ConditionData {
  condition: Condition;
  context: object;
}
interface GrantData {
  grant: InitialAuthTemplateGrant;
  binding?: object;
}

export type CompiledInitialAuth = {
  readonly template: InitialAuthTemplate;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

function isCallback(value: unknown): value is (context: object) => unknown {
  return typeof value === "function";
}

function fail(message: string): never {
  return compilerDiagnostics.fail({
    code: "PH-AUTH-DECLARATION-INVALID",
    path: ["auth"],
    message,
    expected: "a valid typed initial authorization declaration",
    received: "invalid declaration",
    repair:
      "Use the policy builders and references supplied to this version's auth callback.",
  });
}
function record(
  value: unknown,
  keys?: readonly string[],
): Readonly<Record<string, unknown>> {
  const snapshot = snapshotRecord(value, keys, ["auth"]);
  if (!snapshot.ok)
    return fail(`Invalid declaration object (${snapshot.reason}).`);
  return snapshot.value;
}
function array(value: unknown): readonly unknown[] {
  const snapshot = snapshotArray(value, ["auth"]);
  if (!snapshot.ok)
    return fail(`Invalid declaration array (${snapshot.reason}).`);
  return snapshot.value;
}
function member<T>(
  registry: WeakMap<object, T>,
  token: unknown,
  name: string,
): T {
  const value =
    typeof token === "object" && token !== null
      ? registry.get(token)
      : undefined;
  if (value === undefined)
    return fail(
      `The ${name} reference is forged or belongs to another policy or model version.`,
    );
  return value;
}
function token<T>(registry: WeakMap<object, T>, kind: string, data: T): object {
  const value = Object.freeze({ kind });
  registry.set(value, data);
  return value;
}

export function compileModelInitialAuth(
  version: CompiledDocumentModelVersion,
  callback: unknown,
): CompiledInitialAuth {
  if (!isCallback(callback))
    return fail("auth must be a synchronous declaration callback.");
  const scalarRepresentations = scalarRepresentationsFor(
    version.packageScalars.values(),
  );
  const operations = new WeakMap<object, OperationData>();
  const scopes = new WeakMap<object, string>();
  const targets = new WeakMap<object, TargetData>();
  const bindings = new WeakMap<object, InitialAuthBindingDefinition>();
  const bindingSets = new WeakMap<object, Readonly<Record<string, unknown>>>();
  const principals = new WeakMap<object, Principal>();
  const values = new WeakMap<object, ValueData>();
  const conditions = new WeakMap<object, ConditionData>();
  const grants = new WeakMap<object, GrantData>();
  const declarations = new WeakMap<object, InitialAuthTemplate>();
  const diagnostics: DefinitionDiagnostic[] = [];
  let activeContext: object | undefined;

  function value(schema: z.ZodType, path: string, context: object): object {
    const data: ValueData = {
      operand: { attr: path },
      validator: schema,
      primitive: isPrimitiveSchema(schema, scalarRepresentations),
      requiresRepresentation: requiresPrimitiveRepresentation(
        schema,
        scalarRepresentations,
      ),
      context,
    };
    const children = fieldSchemas(schema);
    const target = Object.create(null) as object;
    const proxy = new Proxy(target, {
      get(_target, key) {
        if (typeof key !== "string" || !Object.hasOwn(children, key))
          return fail(`Unknown authorization field ${path}.${String(key)}.`);
        return value(children[key], `${path}.${key}`, context);
      },
    });
    values.set(proxy, data);
    return proxy;
  }
  function condition(node: Condition): object {
    if (activeContext === undefined)
      return fail(
        "Conditions may only be created inside a grant's where or relationship callback.",
      );
    return token(conditions, "powerhouse.auth-condition", {
      condition: node,
      context: activeContext,
    });
  }
  function checkedCondition(input: unknown): Condition {
    const entry = member(conditions, input, "condition");
    if (entry.context !== activeContext)
      return fail("A condition cannot be reused in a different grant context.");
    return entry.condition;
  }
  function checkedValue(input: unknown, primitive: boolean): ValueData {
    const entry = member(values, input, "field");
    if (entry.context !== activeContext)
      return fail("A field cannot be reused in a different grant context.");
    if (primitive && !entry.primitive)
      return fail(
        entry.requiresRepresentation
          ? "A package scalar used in authorization comparisons must declare representation: string, number, or boolean in defineScalar."
          : "Only primitive fields can be compared in authorization conditions.",
      );
    return entry;
  }
  function operand(input: unknown, left: ValueData, ordered: boolean): Operand {
    if (typeof input === "object" && input !== null) {
      const right = checkedValue(input, true);
      if (
        !(
          ordered
            ? ["string", "number"]
            : ["string", "number", "boolean", "null"]
        ).some(
          (kind) =>
            acceptsPrimitive(left.validator, kind, scalarRepresentations) &&
            acceptsPrimitive(right.validator, kind, scalarRepresentations),
        )
      )
        return fail(
          "Compared fields must have compatible primitive representations.",
        );
      return right.operand;
    }
    if (
      input !== null &&
      typeof input !== "string" &&
      typeof input !== "number" &&
      typeof input !== "boolean"
    )
      return fail(
        "An authorization literal must be a string, finite number, boolean, or null.",
      );
    if (
      typeof input === "number" &&
      (!Number.isFinite(input) || Object.is(input, -0))
    )
      return fail(
        "Authorization numbers must be finite and cannot be negative zero.",
      );
    if (ordered && typeof input !== "string" && typeof input !== "number")
      return fail("Ordered comparisons require a string or number.");
    if (!left.validator.safeParse(input).success)
      return fail(
        "The comparison literal does not satisfy the referenced field's descriptor.",
      );
    return { lit: input };
  }
  function compare(
    kind: "eq" | "ne" | "lt" | "lte" | "gt" | "gte",
    leftValue: unknown,
    rightValue: unknown,
  ): object {
    const left = checkedValue(leftValue, true);
    const right = operand(rightValue, left, kind !== "eq" && kind !== "ne");
    const pair: [Operand, Operand] = [left.operand, right];
    switch (kind) {
      case "eq":
        return condition({ eq: pair });
      case "ne":
        return condition({ ne: pair });
      case "lt":
        return condition({ lt: pair });
      case "lte":
        return condition({ lte: pair });
      case "gt":
        return condition({ gt: pair });
      case "gte":
        return condition({ gte: pair });
    }
  }
  function contextFor(target: TargetData): object {
    const stateSchema =
      target.scope === "global"
        ? version.config.scopes.global.root.validator
        : target.scope === "local"
          ? (version.config.scopes.local.root?.validator ?? z.object({}))
          : target.scope === "auth"
            ? authPlatformState.auth
            : authPlatformState.document;
    const context = {};
    return Object.assign(context, {
      ...(target.scope === "header"
        ? {}
        : { state: value(stateSchema, `doc.${target.scope}`, context) }),
      subject: {
        address: value(z.string().optional(), "subject.address", context),
        key: value(z.string().optional(), "subject.key", context),
      },
      ...(target.input === undefined
        ? {}
        : { input: value(target.input, "action.input", context) }),
    });
  }
  function callbackCondition(callback: unknown, context: object): Condition {
    if (!isCallback(callback))
      return fail(
        "A condition must be a synchronous callback returning a condition token.",
      );
    activeContext = context;
    try {
      return checkedCondition(callback(context));
    } finally {
      activeContext = undefined;
    }
  }
  function grant(effect: "allow" | "deny", input: unknown): object {
    const config = record(input, [
      "id",
      "description",
      "principal",
      "target",
      "where",
    ]);
    if (
      typeof config.id !== "string" ||
      config.id.length === 0 ||
      typeof config.description !== "string"
    )
      return fail("A grant requires a nonempty id and a description.");
    const target = member(targets, config.target, "target");
    const context = contextFor(target);
    let principal: Principal | { binding: string };
    let binding: object | undefined;
    if (typeof config.principal === "function")
      principal = { match: callbackCondition(config.principal, context) };
    else if (
      typeof config.principal === "object" &&
      config.principal !== null &&
      bindings.has(config.principal)
    ) {
      binding = config.principal;
      principal = { binding: "" };
    } else principal = member(principals, config.principal, "principal");
    const result: InitialAuthTemplateGrant = {
      id: config.id,
      description: config.description,
      effect,
      principal,
      capability: target.capability,
      ...(config.where === undefined
        ? {}
        : { where: callbackCondition(config.where, context) }),
    };
    return token(grants, "powerhouse.auth-grant", { grant: result, binding });
  }
  const policy = {
    addressBinding(options: unknown) {
      const source = record(options, ["source"]).source;
      if (source !== "deployment" && source !== "instance")
        return fail("A binding source is deployment or instance.");
      return token(bindings, "powerhouse.auth-binding", {
        kind: "address",
        source,
      });
    },
    groupBinding(options: unknown) {
      const source = record(options, ["source"]).source;
      if (source !== "deployment" && source !== "instance")
        return fail("A binding source is deployment or instance.");
      return token(bindings, "powerhouse.auth-binding", {
        kind: "group",
        source,
      });
    },
    bindings(input: unknown) {
      const fields = record(input);
      const seen = new Set<object>();
      for (const [key, ref] of Object.entries(fields)) {
        if (
          !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key) ||
          ["__proto__", "constructor", "prototype"].includes(key)
        )
          return fail("Binding keys must be identifiers.");
        member(bindings, ref, "binding");
        if (seen.has(ref as object))
          return fail("A binding reference can have only one key.");
        seen.add(ref as object);
      }
      const result = Object.freeze({ ...fields });
      bindingSets.set(result, result);
      return result;
    },
    initial(input: unknown) {
      const config = record(input, ["version", "bindings", "grants"]);
      if (config.version !== 1)
        return fail("Only authorization language version 1 is supported.");
      const fields = member(bindingSets, config.bindings, "bindings");
      const entries = Object.entries(fields);
      const definitions = Object.fromEntries(
        entries.map(([key, ref]) => [key, member(bindings, ref, "binding")]),
      );
      const result = array(config.grants).map((ref) => {
        const entry = member(grants, ref, "grant");
        if (entry.binding === undefined) return entry.grant;
        const key = entries.find(
          ([, binding]) => binding === entry.binding,
        )?.[0];
        if (key === undefined)
          return fail(
            "A grant references a binding outside the declared bindings map.",
          );
        return { ...entry.grant, principal: { binding: key } };
      });
      let template: InitialAuthTemplate;
      try {
        template = compileInitialAuthTemplate(
          { version: 1, bindings: definitions, grants: result },
          version.config.id,
        );
      } catch (error) {
        return fail(
          error instanceof Error ? error.message : "Invalid initial policy.",
        );
      }
      for (const [index, entry] of template.grants.entries()) {
        const group =
          "group" in entry.principal ||
          ("binding" in entry.principal &&
            template.bindings[entry.principal.binding]?.kind === "group");
        if (entry.effect === "deny" && group)
          diagnostics.push(
            compilerDiagnostics.create({
              code: "PH-AUTH-GROUP-DENY",
              path: ["auth", "grants", index],
              message:
                "A missing group skips this deny and can expose an earlier allow.",
              repair:
                "Prefer a positive group allow-list and test unavailable group dependencies.",
            }),
          );
      }
      return token(declarations, "powerhouse.initial-auth", template);
    },
    anyone() {
      return token(principals, "powerhouse.auth-principal", { anyone: true });
    },
    address(address: unknown) {
      return token(principals, "powerhouse.auth-principal", {
        address: authAddress(address),
      });
    },
    group(group: unknown) {
      return token(principals, "powerhouse.auth-principal", {
        group: authGroupId(group),
      });
    },
    read(scope: unknown) {
      const name = member(scopes, scope, "scope");
      return token(targets, "powerhouse.auth-target", {
        scope: name,
        capability: { can: "read", scope: name },
      });
    },
    allOperations(scope: unknown) {
      const name = member(scopes, scope, "scope");
      return token(targets, "powerhouse.auth-target", {
        scope: name,
        capability: { can: "execute", scope: name },
      });
    },
    execute(operation: unknown) {
      const op = member(operations, operation, "operation");
      return token(targets, "powerhouse.auth-target", {
        scope: op.scope,
        input: op.input,
        capability: {
          can: "execute",
          scope: op.scope,
          operation: [op.actionType],
        },
      });
    },
    executeMany(input: unknown) {
      const entries = array(input).map((ref) =>
        member(operations, ref, "operation"),
      );
      if (
        entries.length === 0 ||
        entries.some((entry) => entry.scope !== entries[0].scope)
      )
        return fail(
          "executeMany requires one or more operations in the same scope.",
        );
      return token(targets, "powerhouse.auth-target", {
        scope: entries[0].scope,
        capability: {
          can: "execute",
          scope: entries[0].scope,
          operation: entries.map((entry) => entry.actionType),
        },
      });
    },
    allow: (input: unknown) => grant("allow", input),
    deny: (input: unknown) => grant("deny", input),
    eq: (a: unknown, b: unknown) => compare("eq", a, b),
    ne: (a: unknown, b: unknown) => compare("ne", a, b),
    lt: (a: unknown, b: unknown) => compare("lt", a, b),
    lte: (a: unknown, b: unknown) => compare("lte", a, b),
    gt: (a: unknown, b: unknown) => compare("gt", a, b),
    gte: (a: unknown, b: unknown) => compare("gte", a, b),
    in(a: unknown, list: unknown) {
      const left = checkedValue(a, true);
      return condition({
        in: [
          left.operand,
          array(list).map((item) => operand(item, left, false)),
        ],
      });
    },
    notIn(a: unknown, list: unknown) {
      const left = checkedValue(a, true);
      return condition({
        notIn: [
          left.operand,
          array(list).map((item) => operand(item, left, false)),
        ],
      });
    },
    exists(input: unknown) {
      return condition({ exists: checkedValue(input, false).operand });
    },
    and(...input: unknown[]) {
      return condition({ and: input.map(checkedCondition) });
    },
    or(...input: unknown[]) {
      return condition({ or: input.map(checkedCondition) });
    },
    not(input: unknown) {
      return condition({ not: checkedCondition(input) });
    },
  };
  const platformActionTypes = new Set(
    authPlatformScopes().flatMap(([, entries]) =>
      Object.values(entries).map((operation) => operation.actionType),
    ),
  );
  for (const module of version.modules) {
    for (const operation of module.operations) {
      if (
        platformActionTypes.has(operation.actionType) ||
        operation.actionType === "INITIALIZE_AUTH"
      ) {
        fail(
          `Model operation ${operation.actionType} conflicts with a platform authorization target.`,
        );
      }
    }
  }
  const operationCatalog = Object.fromEntries(
    version.modules.map((module) => [
      module.definition.key,
      Object.fromEntries(
        module.operations.map((op) => [
          op.declaration.key,
          token(operations, "powerhouse.auth-operation", {
            scope: op.scope,
            actionType: op.actionType,
            input: op.inputValidator,
          }),
        ]),
      ),
    ]),
  );
  const scopeCatalog = Object.fromEntries(
    ["global", "local", "auth", "document", "header"].map((scope) => {
      const ref = Object.freeze({ kind: "powerhouse.auth-scope", scope });
      scopes.set(ref, scope);
      return [scope, ref];
    }),
  );
  const platform = Object.fromEntries(
    authPlatformScopes().map(([scope, entries]) => [
      scope,
      Object.fromEntries(
        Object.entries(entries).map(([key, op]) => [
          key,
          token(operations, "powerhouse.auth-operation", { scope, ...op }),
        ]),
      ),
    ]),
  );
  const result: unknown = callback(
    Object.freeze({
      operations: operationCatalog,
      scopes: scopeCatalog,
      platform,
      policy,
    }),
  );
  const template = member(declarations, result, "initial policy");
  try {
    validateInitialAuthSpecification(
      { ...version.specification, initialAuth: template },
      version.config.id,
    );
  } catch (error) {
    return fail(
      error instanceof Error
        ? error.message
        : "Invalid initial authorization references.",
    );
  }
  return { template, diagnostics };
}
