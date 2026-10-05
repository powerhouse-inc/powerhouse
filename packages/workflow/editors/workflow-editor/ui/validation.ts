// Lean required-field check shared by the property form, the side panel
// header and the canvas badge. No schema validation: {{}} values defeat it.
import { scheduleConfigIssue } from "@powerhousedao/pieces-framework/workflow";
import type { BlockRef } from "./blocks.js";
import type { BlockForm, BlockFormProp } from "./forms.js";
import type { PropertyModeValue, PropertySettingModel } from "./model.js";
import type { ResolverKeyInput } from "./query-keys.js";

export function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

// Whether a prop's `showWhen` is met; shared with the property form so one rule
// decides render and required — else a hidden field warns with nothing to fix.
export function isPropVisible(
  prop: BlockFormProp,
  config: Record<string, unknown>,
): boolean {
  const rule = prop.showWhen;
  if (!rule) return true;
  return rule.oneOf.includes(config[rule.prop] ?? undefined);
}

function asRecord(config: unknown): Record<string, unknown> {
  return config !== null && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

// Display names of required props with no value; MARKDOWN is informational.
export function missingRequired(
  props: BlockFormProp[],
  config: unknown,
): string[] {
  const record = asRecord(config);
  return props
    .filter(
      (prop) =>
        prop.required &&
        prop.type !== "MARKDOWN" &&
        isPropVisible(prop, record) &&
        isEmptyValue(record[prop.name]),
    )
    .map((prop) => prop.displayName);
}

// What a prop's resolver answer depends on: its refreshers and the connection.
export function resolverInputFor(
  block: BlockRef,
  prop: BlockFormProp,
  config: Record<string, unknown>,
  connectionId: string | null | undefined,
): ResolverKeyInput {
  const refreshers = (prop.refreshers ?? []).filter((name) => name !== "auth");
  return {
    block,
    propName: prop.name,
    refreshers: refreshers.map((name) => config[name] ?? null),
    connectionId: connectionId ?? null,
  };
}

export function settingFor(
  settings: readonly PropertySettingModel[] | null | undefined,
  prop: string,
): PropertySettingModel | undefined {
  return settings?.find((setting) => setting.prop === prop);
}

// A DYNAMIC resolver's answer as a prop list.
export function parsePropList(result: unknown): BlockFormProp[] {
  if (!Array.isArray(result)) throw new Error("Unexpected properties result");
  return result.filter(
    (entry): entry is BlockFormProp =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as BlockFormProp).name === "string",
  );
}

// A stored DYNAMIC schema, when it parses as a prop list.
export function storedSchema(
  settings: readonly PropertySettingModel[] | null | undefined,
  prop: string,
): BlockFormProp[] | undefined {
  const schema = settingFor(settings, prop)?.schema;
  if (!Array.isArray(schema)) return undefined;
  return schema.filter(
    (entry): entry is BlockFormProp =>
      entry !== null &&
      typeof entry === "object" &&
      typeof (entry as BlockFormProp).name === "string",
  );
}

// Children as stored: dropdown options go, they are the resolver's to answer.
export function stripOptions(props: BlockFormProp[]): BlockFormProp[] {
  return props.map((prop) => {
    const { staticOptions: _options, properties, ...rest } = prop;
    return properties
      ? { ...rest, properties: stripOptions(properties) }
      : rest;
  });
}

// Settings with one prop's entry replaced; null drops the schema only.
export function withSetting(
  settings: readonly PropertySettingModel[] | null | undefined,
  prop: string,
  patch: { mode?: PropertyModeValue; schema?: unknown },
): PropertySettingModel[] {
  const list = [...(settings ?? [])];
  const index = list.findIndex((setting) => setting.prop === prop);
  const current = index >= 0 ? list[index] : { prop, mode: "MANUAL" as const };
  const next: PropertySettingModel = {
    prop,
    mode: patch.mode ?? current.mode,
    schema:
      "schema" in patch ? (patch.schema ?? null) : (current.schema ?? null),
  };
  if (index >= 0) list[index] = next;
  else list.push(next);
  return list;
}

export interface ValidityInput {
  form: BlockForm | null | "loading" | undefined;
  block: BlockRef;
  config: unknown;
  connectionId: string | null | undefined;
  propertySettings?: readonly PropertySettingModel[] | null;
  skip?: boolean | null;
  // DYNAMIC children already resolved for a key; undefined when not cached.
  resolveDynamic?: (input: ResolverKeyInput) => BlockFormProp[] | undefined;
}

// What a block still needs before it can run. [] is complete; null is
// unknown: the form isn't there, or a DYNAMIC prop is unresolved.
export function blockMissing(input: ValidityInput): string[] | null {
  if (input.skip) return [];
  const { form } = input;
  if (!form || form === "loading") return null;
  const record = asRecord(input.config);
  const missing: string[] = [];
  let unknown = false;
  if (form.auth === "required" && !input.connectionId) {
    missing.push("Connection");
  }
  for (const prop of form.props) {
    if (prop.type === "MARKDOWN" || !isPropVisible(prop, record)) continue;
    const value = record[prop.name];
    const bound =
      settingFor(input.propertySettings, prop.name)?.mode === "EXPRESSION";
    if (prop.type !== "DYNAMIC" || bound) {
      if (prop.required && isEmptyValue(value)) missing.push(prop.displayName);
      continue;
    }
    const children =
      input.resolveDynamic?.(
        resolverInputFor(input.block, prop, record, input.connectionId),
      ) ?? storedSchema(input.propertySettings, prop.name);
    if (children === undefined) {
      unknown = true;
      continue;
    }
    missing.push(...missingRequired(children, value));
  }
  if (missing.length > 0) return missing;
  // The builder's config is checked by the parser the runtime arms with.
  if (form.display === "schedule") {
    const issue = scheduleConfigIssue(input.config);
    if (issue) return [issue.replace(/^Schedule: /, "")];
  }
  return unknown ? null : [];
}

// Edges leaving on a port the block does not declare: no run takes them.
export function undeclaredPortIssues(
  form: BlockForm | null | "loading" | undefined,
  outgoingPorts: readonly string[] | undefined,
): string[] {
  const ports = form && form !== "loading" ? form.ports : undefined;
  if (!ports || !outgoingPorts) return [];
  return [...new Set(outgoingPorts)]
    .filter((port) => !ports.includes(port))
    .map((port) => `An edge leaves on "${port}", which this block never takes`);
}

export interface WorkflowReadiness {
  // A trigger, and every non-skipped block checked and complete.
  ready: boolean;
  hasTrigger: boolean;
  // First block, in the order given, with a field left to fill.
  firstIncomplete: string | null;
  // Some block is not checked yet: its form or a DYNAMIC schema is unknown.
  checking: boolean;
}

// Folds per-block blockMissing results, trigger first then flow order.
export function workflowReadiness(
  blocks: readonly { id: string; missing: string[] | null }[],
  hasTrigger: boolean,
): WorkflowReadiness {
  const firstIncomplete =
    blocks.find((block) => block.missing && block.missing.length > 0)?.id ??
    null;
  const checking = blocks.some((block) => block.missing === null);
  return {
    ready: hasTrigger && !checking && firstIncomplete === null,
    hasTrigger,
    firstIncomplete,
    checking,
  };
}
