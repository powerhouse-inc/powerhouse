// Runs the host-rules engine over a draft. The builder decides nothing itself.
import type { HostExport } from "@powerhousedao/host-core/schema";
import { useMemo } from "react";
import {
  applySetters,
  checkSetter,
  hostOptions,
  validateDraft,
  type HostRuleIssue,
  type HostRulesContext,
  type Member,
  type OptionGroup,
  type OptionStatus,
  type Setter,
} from "../host-rules/index.js";
import type { BuilderDraft, StepId } from "./draft.js";

export type BuilderEngine = {
  envelope: HostExport;
  members: Member[];
  /** Refused or stale setters, then every rule's findings. */
  issues: HostRuleIssue[];
  options: OptionStatus[];
  context: HostRulesContext;
};

/** Replays the setters as the controller will: policy first, then apply. */
function replay(
  base: HostExport,
  setters: readonly Setter[],
): { envelope: HostExport; issues: HostRuleIssue[] } {
  const issues: HostRuleIssue[] = [];
  const allowed: Setter[] = [];
  for (const setter of setters) {
    const verdict = checkSetter(setter, base);
    if (verdict.ok) allowed.push(setter);
    else {
      issues.push({
        rule: "setter",
        path: setter.path,
        message: verdict.reason,
        ...(verdict.hint === undefined ? {} : { hint: verdict.hint }),
      });
    }
  }
  const applied = applySetters(base, allowed);
  return { envelope: applied.envelope, issues: [...issues, ...applied.issues] };
}

export function builderEngine(
  draft: BuilderDraft,
  context: HostRulesContext,
): BuilderEngine {
  const replayed = replay(draft.base.export, draft.setters);
  const hostDraft = { envelope: replayed.envelope, env: draft.env };
  const validation = validateDraft(hostDraft, context);
  return {
    envelope: replayed.envelope,
    members: validation.members,
    issues: [...replayed.issues, ...validation.issues],
    options: hostOptions(hostDraft, context),
    context,
  };
}

export function useBuilderEngine(
  draft: BuilderDraft | undefined,
  context: HostRulesContext,
): BuilderEngine | undefined {
  return useMemo(
    () => (draft ? builderEngine(draft, context) : undefined),
    [draft, context],
  );
}

function settingKey(option: OptionStatus): string {
  return JSON.stringify([
    option.group,
    option.member,
    option.backend,
    option.drive,
  ]);
}

function selectedBySetting(
  options: readonly OptionStatus[],
): Map<string, string[]> {
  const selected = new Map<string, string[]>();
  for (const option of options) {
    const key = settingKey(option);
    const values = selected.get(key) ?? [];
    if (option.selected) values.push(option.value);
    selected.set(key, values);
  }
  return selected;
}

/**
 * How many settings shown both before and after an edit now have another
 * choice selected, besides the chosen option's own.
 */
export function flippedSettings(
  before: readonly OptionStatus[],
  after: readonly OptionStatus[],
  chosen: OptionStatus,
): number {
  const was = selectedBySetting(before);
  const own = settingKey(chosen);
  let flipped = 0;
  for (const [key, values] of selectedBySetting(after)) {
    const previous = was.get(key);
    if (key === own || previous === undefined) continue;
    if (JSON.stringify(previous) !== JSON.stringify(values)) flipped += 1;
  }
  return flipped;
}

const OPTION_STEP: Record<OptionGroup, StepId> = {
  access: "reactor",
  storage: "reactor",
  backendKind: "reactor",
  hotReload: "reactor",
  workers: "reactor",
  projectionWorker: "reactor",
  add: "members",
  reach: "reactor",
  placement: "reactor",
  port: "members",
  newDrives: "reactor",
  requestTimeout: "reactor",
  breaker: "reactor",
  realtime: "reactor",
  probeTimeout: "reactor",
  provisionalRoute: "reactor",
};

export function optionStep(option: OptionStatus): StepId {
  return OPTION_STEP[option.group];
}

/** The step where an issue at this envelope path is fixed. */
export function stepOf(path: string): StepId {
  const parts = path.split(".");
  if (parts[0] === "env") return "environment";
  if (parts.at(-1) === "name" && parts.length <= 3) return "basics";
  if (parts.length === 1) return "members";
  if (parts[0] === "members" && parts.length === 2) return "members";
  if (parts[1] === "children" && parts.length === 3) return "members";
  if (parts.includes("startOrder")) return "members";
  if (parts.at(-2) === "runner" && parts.at(-1) === "port") return "members";
  return "reactor";
}

/** The member an envelope path belongs to, if any. */
export function memberOf(
  members: readonly Member[],
  path: string,
): Member | undefined {
  const within = (root: string) => path === root || path.startsWith(`${root}.`);
  return (
    members.find((member) => member.path !== "host" && within(member.path)) ??
    members.find(
      (member) => within(member.reactorAt) || within(member.configAt),
    ) ??
    members.find((member) => member.path === "host" && within("host"))
  );
}
