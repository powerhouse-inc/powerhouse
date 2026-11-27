import { Check, Copy, History, TriangleAlert } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Code } from "../components/code.js";
import { CopyCommand } from "../components/copy-button.js";
import { Segmented } from "../components/segmented.js";
import { Tag } from "../components/status.js";
import { tabPanelProps } from "../components/tabs.js";
import { Mono, Prose } from "../components/text.js";
import { useCopy } from "../hooks/use-copy.js";
import { cn } from "../lib/cn.js";
import { Button } from "../ui/button.js";
import { Checkbox } from "../ui/checkbox.js";
import type { ProjectModuleKind } from "../api.js";
import { plural } from "../lib/plural.js";
import type { PanelMark } from "../shell/registry.js";
import { MODULE_KINDS } from "./kinds.js";
import { countLegacy, type Legacy, type LegacyMigration } from "./legacy.js";
import { useProjectModules } from "./provider.js";

export const LegacyIcon = History;

export const legacyCountLabel = (kind: ProjectModuleKind, count: number) =>
  plural(count, `legacy ${MODULE_KINDS[kind].noun}`);

/** The sign, beside a kind's title, that it has legacy modules. */
export function useLegacyMark(kind: ProjectModuleKind): PanelMark | undefined {
  const section = useProjectModules(kind);
  return useMemo(() => {
    const count = section?.ok ? countLegacy(section.items) : 0;
    if (count === 0) return undefined;
    return {
      icon: LegacyIcon,
      label: legacyCountLabel(kind, count),
      text: `${count} legacy`,
    };
  }, [section, kind]);
}

export function LegacyTag({
  legacy,
  short = false,
  className,
}: {
  legacy: Legacy;
  short?: boolean;
  className?: string;
}) {
  return (
    <Tag
      tone="warn"
      data-testid="ph-legacy-tag"
      title={short ? legacy.title : undefined}
      className={className}
    >
      <LegacyIcon aria-hidden className="size-3" />
      {short ? "Legacy" : legacy.title}
    </Tag>
  );
}

const WAYS = [
  { id: "command", label: "Run a command" },
  { id: "agent", label: "Ask an agent" },
] as const;

type Way = (typeof WAYS)[number]["id"];

function Migration({ migration }: { migration: LegacyMigration }) {
  const [way, setWay] = useState<Way>("command");
  const [dryRun, setDryRun] = useState(false);
  const [copied, copy] = useCopy();
  const panelId = useId();
  return (
    <>
      <div className="mt-2.5 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <Segmented
          mode={{ kind: "tabs", panelId }}
          label="How to convert it"
          items={WAYS.map((item) => ({
            ...item,
            data: { "data-testid": "ph-legacy-way", "data-way": item.id },
          }))}
          value={way}
          onChange={setWay}
        />
        {way === "command" ? (
          <label
            data-testid="ph-legacy-dry-run"
            className="flex min-h-6 cursor-pointer items-center gap-1.5 text-[12px] text-muted-foreground"
          >
            <Checkbox
              checked={dryRun}
              onCheckedChange={setDryRun}
              className="size-3.5"
            />
            <span>
              Preview first with <Mono>--dry-run</Mono>
            </span>
          </label>
        ) : (
          <Button
            variant="outline"
            size="xs"
            data-testid="ph-legacy-copy-prompt"
            className="ml-auto"
            onClick={() => copy(migration.agentPrompt)}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy prompt"}
          </Button>
        )}
      </div>
      <div {...tabPanelProps(panelId, way)}>
        {way === "command" ? (
          <CopyCommand command={migration.command({ dryRun })} />
        ) : (
          <Code className="max-h-44 font-sans whitespace-pre-wrap">
            <span data-testid="ph-legacy-prompt">
              <Prose text={migration.agentPrompt} />
            </span>
          </Code>
        )}
      </div>
    </>
  );
}

export function LegacyNotice({
  legacy,
  className,
}: {
  legacy: Legacy;
  className?: string;
}) {
  const { title, migration } = legacy;
  return (
    <section
      aria-label={title}
      data-testid="ph-legacy-notice"
      className={cn(
        "min-w-0 rounded-md border px-3 py-2.5 text-[13px]",
        className,
      )}
    >
      <div className="flex min-w-0 gap-2.5">
        <TriangleAlert
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-warning"
        />
        <div className="min-w-0">
          <p className="font-medium break-words">{title}</p>
          <p className="mt-0.5 max-w-[70ch] text-[12px] text-pretty text-muted-foreground">
            Powerhouse 6.4 is planned to stop loading packages that have one.
            This notice goes away when DevTools reads the converted files.
          </p>
        </div>
      </div>
      <Migration migration={migration} />
    </section>
  );
}
