// Piece-selector-style popover, adapted from the Activepieces builder
// pieces-selector (MIT, activepieces packages/web).
import { useEffect, useRef, useState } from "react";
import { blockMeta } from "./block-meta.js";
import type { BlockPreset } from "./blocks.js";

export function BlockLogo(props: { blockType: string; size?: number }) {
  const meta = blockMeta(props.blockType);
  const size = props.size ?? 36;
  if (meta.logoUrl) {
    return (
      <div
        className="flex shrink-0 items-center justify-center rounded-sm border border-solid border-slate-200 bg-white"
        style={{ width: size, height: size, padding: size / 5 }}
      >
        <img
          src={meta.logoUrl}
          alt={meta.displayName}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-sm border border-solid border-slate-200 bg-slate-50 text-slate-600"
      style={{ width: size, height: size, fontSize: size / 2 }}
    >
      {meta.glyph ?? "?"}
    </div>
  );
}

export function BlockSelector(props: {
  title: string;
  presets: BlockPreset[];
  onPick: (preset: BlockPreset) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as globalThis.Node)) {
        props.onClose();
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [props]);

  const filtered = props.presets.filter((preset) =>
    `${preset.label} ${preset.blockType}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );

  return (
    <div
      ref={containerRef}
      className="nodrag nopan w-72 rounded-md border border-solid border-slate-200 bg-white shadow-lg"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-slate-100 p-2">
        <div className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {props.title}
        </div>
        <input
          autoFocus
          className="w-full rounded border border-slate-200 px-2 py-1 text-xs"
          placeholder="Search…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="max-h-64 overflow-y-auto py-1">
        {filtered.map((preset) => (
          <button
            key={preset.blockType + preset.label}
            type="button"
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
            onClick={() => props.onPick(preset)}
          >
            <BlockLogo blockType={preset.blockType} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium text-slate-800">
                {preset.label}
              </span>
              <span className="block truncate text-[11px] text-slate-400">
                {preset.description}
              </span>
            </span>
          </button>
        ))}
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-xs text-slate-400">No matches</div>
        ) : null}
      </div>
    </div>
  );
}
