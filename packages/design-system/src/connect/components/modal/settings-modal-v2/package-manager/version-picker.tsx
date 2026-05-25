import { cn, Icon } from "#design-system";
import {
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#design-system/ui";
import { useMemo, useState } from "react";

export type VersionSelection =
  | { kind: "tag"; value: string }
  | { kind: "version"; value: string };

export interface VersionPickerProps {
  distTags?: Record<string, string>;
  versions?: string[];
  selected: VersionSelection;
  onChange: (next: VersionSelection) => void;
  disabled?: boolean;
  className?: string;
}

export function resolveDefaultVersionSelection(options: {
  distTags?: Record<string, string>;
  versions?: string[];
  version?: string;
  preferredTag?: string;
}): VersionSelection {
  const { distTags, versions, version, preferredTag } = options;

  if (preferredTag && distTags && preferredTag in distTags) {
    return { kind: "tag", value: preferredTag };
  }
  if (distTags?.latest) {
    return { kind: "tag", value: "latest" };
  }
  const firstTag = distTags ? Object.keys(distTags)[0] : undefined;
  if (firstTag) {
    return { kind: "tag", value: firstTag };
  }
  if (versions && versions.length > 0) {
    return { kind: "version", value: versions[versions.length - 1] };
  }
  return { kind: "tag", value: version ?? "latest" };
}

export const VersionPicker: React.FC<VersionPickerProps> = (props) => {
  const { distTags, versions, selected, onChange, disabled, className } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const tagEntries = useMemo(
    () => (distTags ? Object.entries(distTags) : []),
    [distTags],
  );

  const filteredTags = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tagEntries;
    return tagEntries.filter(
      ([tag, ver]) =>
        tag.toLowerCase().includes(needle) ||
        ver.toLowerCase().includes(needle),
    );
  }, [tagEntries, query]);

  const filteredVersions = useMemo(() => {
    const all = versions ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return all.slice().reverse();
    return all.filter((v) => v.toLowerCase().includes(needle)).reverse();
  }, [versions, query]);

  const hasAnyPickable = tagEntries.length > 0 || (versions?.length ?? 0) > 0;

  const triggerLabel = selected.value;

  return (
    <Popover
      open={open && !disabled}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        disabled={disabled || !hasAnyPickable}
        className={cn(
          "flex items-center justify-between gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100",
          "hover:bg-gray-50 focus:ring-2 focus:ring-gray-900/20 focus:outline-none dark:hover:bg-slate-800",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        data-version-picker-trigger
      >
        <span className="truncate">{triggerLabel}</span>
        <Icon
          name="ChevronDown"
          size={12}
          className="shrink-0 text-gray-500 dark:text-slate-400"
        />
      </PopoverTrigger>
      <PopoverContent
        data-version-picker
        align="start"
        sideOffset={4}
        className="w-56 p-0"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="border-b border-gray-200 p-2 dark:border-slate-700">
          <div className="relative">
            <Icon
              name="Search"
              size={14}
              className="absolute top-1/2 left-2 -translate-y-1/2 text-gray-400 dark:text-slate-500"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search versions..."
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {filteredTags.length === 0 && filteredVersions.length === 0 && (
            <p className="px-3 py-4 text-center text-xs text-gray-500 dark:text-slate-400">
              No matches.
            </p>
          )}
          {filteredTags.length > 0 && (
            <div className="pb-1">
              <p className="px-3 py-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-slate-400">
                Tags
              </p>
              {filteredTags.map(([tag, ver]) => {
                const isSelected =
                  selected.kind === "tag" && selected.value === tag;
                return (
                  <button
                    key={`tag:${tag}`}
                    type="button"
                    onClick={() => {
                      onChange({ kind: "tag", value: tag });
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs transition-colors",
                      "hover:bg-gray-100 dark:hover:bg-slate-700",
                      isSelected &&
                        "bg-gray-100 font-semibold dark:bg-slate-700",
                    )}
                  >
                    <span className="truncate text-gray-900 dark:text-slate-50">
                      {tag}
                    </span>
                    <span className="truncate text-gray-500 dark:text-slate-400">
                      {ver}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {filteredVersions.length > 0 && (
            <div>
              <p className="px-3 py-1 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-slate-400">
                Versions
              </p>
              {filteredVersions.map((ver) => {
                const isSelected =
                  selected.kind === "version" && selected.value === ver;
                return (
                  <button
                    key={`ver:${ver}`}
                    type="button"
                    onClick={() => {
                      onChange({ kind: "version", value: ver });
                      setOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "flex w-full items-center px-3 py-1.5 text-left text-xs transition-colors",
                      "hover:bg-gray-100 dark:hover:bg-slate-700",
                      isSelected &&
                        "bg-gray-100 font-semibold dark:bg-slate-700",
                    )}
                  >
                    <span className="truncate text-gray-900 dark:text-slate-50">
                      {ver}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
