// The blocks this browser picked last, per kind. Stored without a version,
// so a pick from the list pins whatever the catalog offers now.
import type { BlockKind, BlockPick, BlockPreset } from "./blocks.js";

const STORAGE_KEY = "ph-workflow-picker-recent:v1";
const MAX_RECENT = 6;

interface StoredPick {
  label: string;
  description?: string;
  block: { pieceName: string; kind: BlockKind; name: string };
}

// Storage is another tab's or an older build's writing; every field is checked.
function isStoredPick(value: unknown): value is StoredPick {
  const entry = value as Partial<StoredPick> | null;
  const block = entry?.block as Partial<StoredPick["block"]> | undefined;
  return (
    typeof entry?.label === "string" &&
    typeof block?.pieceName === "string" &&
    typeof block.name === "string" &&
    (block.kind === "action" || block.kind === "trigger")
  );
}

function readAll(): StoredPick[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isStoredPick) : [];
  } catch {
    return [];
  }
}

export function recentPicks(kind: BlockKind): BlockPreset[] {
  return readAll()
    .filter((entry) => entry.block.kind === kind)
    .map((entry) => ({
      label: entry.label,
      description: entry.description ?? "",
      block: entry.block satisfies BlockPick,
      defaultConfig: {},
    }));
}

export function rememberPick(preset: BlockPreset): void {
  const { pieceName, kind, name } = preset.block;
  const entry: StoredPick = {
    label: preset.label,
    description: preset.description,
    block: { pieceName, kind, name },
  };
  const same = (other: StoredPick) =>
    other.block.pieceName === pieceName &&
    other.block.kind === kind &&
    other.block.name === name;
  const ofKind = readAll().filter((other) => other.block.kind === kind);
  const others = readAll().filter((other) => other.block.kind !== kind);
  const next = [entry, ...ofKind.filter((other) => !same(other))].slice(
    0,
    MAX_RECENT,
  );
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([...next, ...others]),
    );
  } catch {
    // Storage off or full: the list is a convenience.
  }
}
