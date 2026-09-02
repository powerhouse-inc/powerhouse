// Shim for @/features/flow-runs: run playback is out of scope, so the
// utilities return "no run" answers and neutral status visuals.
import { CheckIcon, XIcon } from "lucide-react";
import { createElement, type ReactElement } from "react";
import type { FlowRun, StepOutput } from "../vendor/shared/index.js";

export const flowRunsApi = {
  getPopulated(_id: string): Promise<FlowRun> {
    return Promise.reject(new Error("Flow runs are not available"));
  },
};

export type StatusVariant = "default" | "success" | "error" | "warning";

export function StepStatusIcon(props: {
  status: unknown;
  size: string;
  hideTooltip?: boolean;
}): ReactElement {
  const failed = props.status === "FAILED";
  return createElement(failed ? XIcon : CheckIcon, { size: 14 });
}

export const flowRunUtils = {
  findLastStepWithStatus(
    _status: unknown,
    _steps: Record<string, unknown>,
  ): string | null {
    return null;
  },
  pinLoopsToIterationsWithFailedStep(
    _run: FlowRun,
    loopsIndexes: Record<string, number>,
    _options?: { liveFollowPaused?: boolean },
  ): Record<string, number> {
    return loopsIndexes;
  },
  snapLoopsToLatestIteration(
    _run: FlowRun,
    loopsIndexes: Record<string, number>,
  ): Record<string, number> {
    return loopsIndexes;
  },
  extractStepOutput(
    _stepName: string,
    _loopsIndexes: Record<string, number>,
    _steps: Record<string, unknown>,
  ): StepOutput | undefined {
    return undefined;
  },
  getStatusIconForStep(_status: unknown): {
    variant: StatusVariant;
    text: string;
  } {
    return { variant: "default", text: "" };
  },
  getStatusContainerClassName(
    _variant: StatusVariant,
    _compact?: boolean,
  ): string {
    return "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs";
  },
};
