// Which piece version each block runs: the canvas badge, the header summary
// and the step panel's update offer all read one resolution list.
import {
  compareVersions,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import { createContext, useContext, type ReactNode } from "react";
import type { BlockResolutionView } from "./forms.js";

export type VersionTone = "neutral" | "warn" | "fail";

export interface VersionBadgeView {
  tone: VersionTone;
  label: string;
  title: string;
}

// The runtime's note, else what was configured against what runs.
export function resolutionText(resolution: BlockResolutionView): string {
  if (resolution.note) return resolution.note;
  if (!resolution.resolvedVersion)
    return `Nothing resolves ${resolution.pieceName} ${resolution.kind} "${resolution.name}"`;
  const from = resolution.source ? ` from ${resolution.source}` : "";
  return `Configured with v${resolution.pieceVersion}, runs v${resolution.resolvedVersion}${from}`;
}

// True when the block does not run the version it is configured with.
export function runsDifferentVersion(resolution: BlockResolutionView): boolean {
  switch (resolution.match) {
    case "exact":
      return false;
    case "installed":
      return resolution.resolvedVersion !== resolution.pieceVersion;
    default:
      return true;
  }
}

export function versionBadge(
  resolution: BlockResolutionView | undefined,
): VersionBadgeView | null {
  if (!resolution || !runsDifferentVersion(resolution)) return null;
  const title = resolutionText(resolution);
  if (resolution.match === "missing") {
    return { tone: "fail", label: "Missing", title };
  }
  return {
    tone: resolution.match === "fallback" ? "warn" : "neutral",
    label: `v${resolution.resolvedVersion}`,
    title,
  };
}

/** The newer version to offer, when a source has one above the pin. */
export function updateVersion(
  resolution: BlockResolutionView | undefined,
): string | null {
  const { pieceVersion, latestVersion } = resolution ?? {};
  if (!pieceVersion || !latestVersion) return null;
  try {
    return compareVersions(latestVersion, pieceVersion) > 0
      ? latestVersion
      : null;
  } catch {
    return null;
  }
}

const ResolutionsContext = createContext<readonly BlockResolutionView[]>([]);
const DraftBlocksContext = createContext<readonly BlockRef[]>([]);

export function BlockResolutionsProvider(props: {
  resolutions: readonly BlockResolutionView[];
  // Every block the draft holds, for the picker's version hints.
  blocks: readonly BlockRef[];
  children: ReactNode;
}) {
  return (
    <DraftBlocksContext.Provider value={props.blocks}>
      <ResolutionsContext.Provider value={props.resolutions}>
        {props.children}
      </ResolutionsContext.Provider>
    </DraftBlocksContext.Provider>
  );
}

export function useDraftBlocks(): readonly BlockRef[] {
  return useContext(DraftBlocksContext);
}

// Only an answer for the block, at the version, the draft holds now.
export function useResolution(
  id: string,
  block: BlockRef,
): BlockResolutionView | undefined {
  const resolutions = useContext(ResolutionsContext);
  return resolutions.find(
    (entry) =>
      entry.stepId === id &&
      entry.pieceName === block.pieceName &&
      entry.pieceVersion === block.pieceVersion &&
      entry.kind === block.kind &&
      entry.name === block.name,
  );
}

const SUMMARY_TONE: Record<"neutral" | "warn", string> = {
  neutral: "text-muted-foreground hover:text-foreground",
  warn: "text-wf-warn",
};

export interface VersionSummaryView {
  text: string;
  // Amber only when a step runs another major or nothing at all.
  tone: "neutral" | "warn";
  title: string;
  firstStepId: string;
}

export function versionSummary(
  resolutions: readonly BlockResolutionView[],
): VersionSummaryView | null {
  const differing = resolutions.filter(runsDifferentVersion);
  if (differing.length === 0) return null;
  const missing = differing.filter((entry) => entry.match === "missing");
  const count = missing.length > 0 ? missing.length : differing.length;
  const noun = count === 1 ? "step" : "steps";
  const text =
    missing.length > 0
      ? `${count} ${noun} can't find ${count === 1 ? "its" : "their"} piece`
      : `${count} ${noun} ${count === 1 ? "runs" : "run"} a different piece version`;
  const warn = differing.some(
    (entry) => entry.match === "fallback" || entry.match === "missing",
  );
  return {
    text,
    tone: warn ? "warn" : "neutral",
    title: differing.map(resolutionText).join("\n"),
    firstStepId: (missing.length > 0 ? missing : differing)[0].stepId,
  };
}

// "2 steps run a different piece version"; selects the first on click.
export function VersionSummary(props: {
  resolutions: readonly BlockResolutionView[];
  onSelect: (id: string) => void;
}) {
  const summary = versionSummary(props.resolutions);
  if (!summary) return null;
  return (
    <button
      type="button"
      data-tone={summary.tone}
      className={`truncate text-xs underline-offset-2 hover:underline ${SUMMARY_TONE[summary.tone]}`}
      title={summary.title}
      onClick={() => props.onSelect(summary.firstStepId)}
    >
      {summary.text}
    </button>
  );
}
