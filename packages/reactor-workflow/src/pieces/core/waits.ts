// Core blocks that suspend the run: Delay waits on the clock, Request approval
// on a person. The host runs them in process and resumes them as RESUME.
import { createAction, Property } from "@powerhousedao/pieces-framework";
import {
  NEXT_PORT,
  PIECE_ACTION_PORTS,
} from "@powerhousedao/pieces-framework/workflow";
import type { WaitpointApproval } from "../engine/types.js";
import { CoreCannotPauseError, type CoreActionContext } from "./context.js";
import { shownWhen, withHints, withPorts } from "./hints.js";

const UNIT_MS = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
} as const;

type DurationUnit = keyof typeof UNIT_MS;

export const unitOptions = (Object.keys(UNIT_MS) as DurationUnit[]).map(
  (unit) => ({
    value: unit,
    label: unit[0]!.toUpperCase() + unit.slice(1),
  }),
);

// Milliseconds for `amount` `unit`; undefined for a blank amount.
export function durationMs(
  amount: unknown,
  unit: unknown,
  label: string,
): number | undefined {
  if (amount === undefined || amount === null || amount === "") {
    return undefined;
  }
  const value = Number(amount);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label}: ${JSON.stringify(amount)} is not a duration`);
  }
  if (typeof unit !== "string" || !Object.hasOwn(UNIT_MS, unit)) {
    throw new Error(`${label}: unknown unit ${JSON.stringify(unit)}`);
  }
  return value * UNIT_MS[unit as DurationUnit];
}

function context(ctx: unknown): CoreActionContext {
  return ctx as CoreActionContext;
}

function assertCanPause(ctx: CoreActionContext, block: string): void {
  if (!ctx.run.canPause) throw new CoreCannotPauseError(block);
}

export const delayAction = withPorts(
  createAction({
    name: "delay",
    displayName: "Delay",
    description:
      "Suspends the run for a while, or until a date, then carries on. The " +
      "run holds no worker while it waits.",
    requireAuth: false,
    props: {
      mode: Property.StaticDropdown({
        displayName: "Mode",
        required: true,
        defaultValue: "for",
        options: {
          options: [
            { value: "for", label: "Delay for" },
            { value: "until", label: "Delay until" },
          ],
        },
      }),
      amount: withHints(
        Property.Number({
          displayName: "Amount",
          required: true,
        }),
        shownWhen("mode", ["for"]),
      ),
      unit: withHints(
        Property.StaticDropdown({
          displayName: "Unit",
          required: true,
          defaultValue: "minutes",
          options: { options: unitOptions },
        }),
        shownWhen("mode", ["for"]),
      ),
      until: withHints(
        Property.DateTime({
          displayName: "Until",
          description: "ISO 8601 date and time; a past one does not wait.",
          required: true,
        }),
        shownWhen("mode", ["until"]),
      ),
    },
    run: async (raw) => {
      const ctx = context(raw);
      if (ctx.executionType === "RESUME") {
        return { resumedAt: new Date().toISOString() };
      }
      const { mode, amount, unit, until } = ctx.propsValue;
      let resumeAt: number;
      if (mode === "until") {
        resumeAt = typeof until === "string" ? Date.parse(until) : NaN;
        if (Number.isNaN(resumeAt)) {
          throw new Error(
            `Delay: ${JSON.stringify(until)} is not a date and time`,
          );
        }
      } else {
        const ms = durationMs(amount, unit, "Delay");
        if (ms === undefined) throw new Error("Delay: an amount is required");
        resumeAt = Date.now() + ms;
      }
      if (resumeAt <= Date.now()) {
        return { resumedAt: new Date().toISOString() };
      }
      assertCanPause(ctx, "Delay");
      const resumeDateTime = new Date(resumeAt).toISOString();
      const waitpoint = await ctx.run.createWaitpoint({
        type: "DELAY",
        resumeDateTime,
      });
      ctx.run.waitForWaitpoint(waitpoint.id);
      return { resumeAt: resumeDateTime };
    },
  }),
  { ports: PIECE_ACTION_PORTS, portOf: () => NEXT_PORT },
);

const REASON_RULES = ["none", "reject", "both"] as const;

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function approvers(value: unknown): string[] {
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  return [
    ...new Set(list.map((entry) => String(entry).trim()).filter(Boolean)),
  ];
}

// The decision, from the editor (body) or a resume URL (query string).
export function approvalDecision(payload: unknown): {
  approved: boolean;
  reason: string | null;
  decidedBy: string | null;
  decidedAt: string;
} {
  const record = (payload ?? {}) as {
    body?: unknown;
    queryParams?: Record<string, unknown>;
  };
  const body =
    record.body && typeof record.body === "object"
      ? (record.body as Record<string, unknown>)
      : {};
  const query = record.queryParams ?? {};
  const approved =
    typeof body.approved === "boolean"
      ? body.approved
      : query.action === "approve";
  const reason = [body.reason, query.reason].find(
    (value): value is string => typeof value === "string" && value !== "",
  );
  return {
    approved,
    reason: reason ?? null,
    decidedBy: typeof body.decidedBy === "string" ? body.decidedBy : null,
    // When it was decided, not when the run resumed; a resume URL carries none.
    decidedAt:
      typeof body.decidedAt === "string"
        ? body.decidedAt
        : new Date().toISOString(),
  };
}

export const approvalAction = withPorts(
  createAction({
    name: "approval",
    displayName: "Request approval",
    description:
      "Suspends the run until someone approves or rejects it in the " +
      "workflow editor. The decision is the step's output.",
    requireAuth: false,
    props: {
      title: Property.ShortText({
        displayName: "Title",
        required: true,
      }),
      body: Property.LongText({
        displayName: "Details",
        description:
          "Markdown shown to the approver; expressions are filled in when the run pauses.",
        required: false,
      }),
      approveLabel: Property.ShortText({
        displayName: "Approve label",
        required: false,
        defaultValue: "Approve",
      }),
      rejectLabel: Property.ShortText({
        displayName: "Reject label",
        required: false,
        defaultValue: "Reject",
      }),
      reasonRequiredOn: Property.StaticDropdown({
        displayName: "Reason required",
        required: false,
        defaultValue: "none",
        options: {
          options: [
            { value: "none", label: "Never" },
            { value: "reject", label: "On reject" },
            { value: "both", label: "Always" },
          ],
        },
      }),
      approvers: Property.Array({
        displayName: "Approvers",
        description:
          "DIDs or addresses allowed to decide in the editor; empty lets anyone who can edit the workflow.",
        required: false,
      }),
      expiresAfter: Property.Number({
        displayName: "Expires after",
        description:
          "Ends the run if nobody decides in time; the workflow's maxSuspensionDays still applies.",
        required: false,
      }),
      expiresUnit: Property.StaticDropdown({
        displayName: "Expiry unit",
        required: false,
        defaultValue: "days",
        options: { options: unitOptions },
      }),
    },
    run: async (raw) => {
      const ctx = context(raw);
      if (ctx.executionType === "RESUME") {
        return approvalDecision(ctx.resumePayload);
      }
      assertCanPause(ctx, "Request approval");
      const props = ctx.propsValue;
      const rule = REASON_RULES.includes(props.reasonRequiredOn as never)
        ? (props.reasonRequiredOn as WaitpointApproval["reasonRequiredOn"])
        : "none";
      const approval: WaitpointApproval = {
        title: text(props.title, "Approval"),
        body: typeof props.body === "string" && props.body ? props.body : null,
        approveLabel: text(props.approveLabel, "Approve"),
        rejectLabel: text(props.rejectLabel, "Reject"),
        reasonRequiredOn: rule,
        approvers: approvers(props.approvers),
      };
      const expiresMs = durationMs(
        props.expiresAfter,
        props.expiresUnit ?? "days",
        "Request approval",
      );
      const waitpoint = await ctx.run.createWaitpoint({
        type: "WEBHOOK",
        approval,
        ...(expiresMs
          ? { expiresAt: new Date(Date.now() + expiresMs).toISOString() }
          : {}),
      });
      ctx.run.waitForWaitpoint(waitpoint.id);
      return {};
    },
  }),
  { ports: PIECE_ACTION_PORTS, portOf: () => NEXT_PORT },
);
