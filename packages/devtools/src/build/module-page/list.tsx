import { Check, Plus, Search, SearchX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ProjectCheck } from "../../api.js";
import { EmptyState, Mono, StatusDot, Tag } from "../../kit.js";
import { cn } from "../../lib/cn.js";
import { Button } from "../../ui/button.js";
import { Input } from "../../ui/input.js";
import { MODULE_KINDS, problemsOf, worstCheck } from "../project/kinds.js";
import { checksTone, useCopy } from "../project/parts.js";
import { includesSearch, Row, Rows, Switcher } from "../ui.js";
import { subline, type PageModule } from "./text.js";

function ProblemCount({
  checks,
  className,
}: {
  checks: readonly ProjectCheck[];
  className?: string;
}) {
  const problems = problemsOf(checks);
  if (problems.length === 0) return null;
  return (
    <Tag
      tone={checksTone(checks)}
      title={problems.map((check) => check.label).join("\n")}
      className={cn("tabular-nums", className)}
    >
      {problems.length}
    </Tag>
  );
}

function ModuleRow({
  entry,
  selected,
  linked,
  onSelect,
}: {
  entry: PageModule;
  selected: boolean;
  linked: boolean;
  onSelect: () => void;
}) {
  const { checks } = entry.module;
  const second = subline(entry);
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (linked) row.current?.scrollIntoView({ block: "nearest" });
  }, [linked]);
  return (
    <Row
      selected={selected}
      onSelect={onSelect}
      rowRef={row}
      label={entry.name}
      data-testid="ph-module-row"
      data-module-id={entry.id}
      data-state={worstCheck(checks) ?? "none"}
      className="grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-2.5 py-1"
    >
      <span className="flex h-5 items-center">
        <StatusDot tone={checksTone(checks)} className="size-1.5" />
      </span>
      <span className="min-w-0">
        <span className="block leading-5 break-words">{entry.name}</span>
        {second && (
          <Mono
            title={second}
            className="block truncate text-[11px] text-muted-foreground"
          >
            {second}
          </Mono>
        )}
      </span>
      <ProblemCount checks={checks} className="mt-0.5" />
    </Row>
  );
}

export function GenerateCommandButton({
  kind,
  className,
}: {
  kind: PageModule["kind"];
  className?: string;
}) {
  const { noun, command } = MODULE_KINDS[kind];
  const [copied, copy] = useCopy();
  return (
    <Button
      variant="outline"
      size="icon-sm"
      data-testid="ph-module-new"
      className={className}
      title={copied ? "Copied" : `New ${noun}: copy ${command}`}
      aria-label={copied ? "Copied" : `New ${noun}: copy ${command}`}
      onClick={() => copy(command)}
    >
      {copied ? <Check /> : <Plus />}
    </Button>
  );
}

const searchText = (entry: PageModule) => [
  entry.name,
  entry.id,
  subline(entry),
];

/** Rows are told apart by folder: two modules can state the same id. */
export function ModuleList({
  kind,
  modules,
  selected,
  linked,
  onSelect,
}: {
  kind: PageModule["kind"];
  modules: readonly PageModule[];
  selected: PageModule;
  /** The location names the selected module, so its row scrolls into view. */
  linked: boolean;
  onSelect: (entry: PageModule) => void;
}) {
  const { title, noun } = MODULE_KINDS[kind];
  const [query, setQuery] = useState("");
  const shown = modules.filter((entry) =>
    includesSearch(searchText(entry), query),
  );
  return (
    <div className="min-w-0 pb-2">
      <div className="flex items-center gap-1.5 px-1 pb-1.5">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label={`Search ${noun}s`}
            data-testid="ph-module-filter"
            className="h-7 pl-7 text-[12px]!"
          />
        </div>
        <GenerateCommandButton kind={kind} />
      </div>
      {shown.length === 0 ? (
        <EmptyState
          data-testid="ph-modules-no-match"
          icon={SearchX}
          compact
          title={
            <>
              No {noun} matches &ldquo;{query.trim()}&rdquo;
            </>
          }
          action={
            <div className="flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear the search
              </Button>
            </div>
          }
        >
          The search looks at names, ids and the line below each name.
        </EmptyState>
      ) : (
        <Rows label={title} className="grid">
          {shown.map((entry) => {
            const isSelected = entry.module.folder === selected.module.folder;
            return (
              <ModuleRow
                key={entry.module.folder}
                entry={entry}
                selected={isSelected}
                linked={isSelected && linked}
                onSelect={() => onSelect(entry)}
              />
            );
          })}
        </Rows>
      )}
    </div>
  );
}

export function ModuleSwitcher({
  kind,
  modules,
  selected,
  onSelect,
  className,
}: {
  kind: PageModule["kind"];
  modules: readonly PageModule[];
  selected: PageModule;
  onSelect: (entry: PageModule) => void;
  className?: string;
}) {
  const { noun } = MODULE_KINDS[kind];
  const find = `Find ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}`;
  return (
    <Switcher
      items={modules}
      selected={selected}
      itemKey={(entry) => entry.module.folder}
      name={(entry) => entry.name}
      searchText={searchText}
      onSelect={onSelect}
      tooltip={`Switch ${noun}`}
      searchLabel={find}
      noMatch={`No ${noun} matches.`}
      testId="ph-module"
      itemData={(entry) => ({ "data-module-id": entry.id })}
      className={className}
      renderItem={(entry) => {
        const second = subline(entry);
        return (
          <>
            <span className="flex h-4 items-center">
              <StatusDot
                tone={checksTone(entry.module.checks)}
                className="size-1.5"
              />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium break-words">{entry.name}</span>
              {second && (
                <Mono className="text-[11.5px] break-all text-muted-foreground">
                  {second}
                </Mono>
              )}
            </span>
            <ProblemCount checks={entry.module.checks} />
          </>
        );
      }}
    />
  );
}
