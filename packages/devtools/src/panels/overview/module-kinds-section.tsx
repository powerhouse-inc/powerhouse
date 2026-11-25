import {
  CircleCheck,
  CircleX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { ProjectModuleKind, ProjectSection } from "../../api.js";
import { Skeleton } from "../../components/loading.js";
import { Section } from "../../components/section.js";
import { cn } from "../../lib/cn.js";
import { plural } from "../../lib/plural.js";
import {
  MODULE_KIND_ORDER,
  MODULE_KINDS,
  projectModules,
  type ProjectModule,
} from "../../project/kinds.js";
import { worstCheck } from "../../project/checks.js";
import { useProject } from "../../project/provider.js";
import { panelById } from "../../shell/location.js";
import { useShell } from "../../shell/state.js";

type KindHealth =
  | { state: "loading" }
  | { state: "unreadable"; message: string }
  | { state: "read"; count: number; failing: number; warning: number };

function kindHealth(
  section: ProjectSection<ProjectModule> | undefined,
): KindHealth {
  if (!section) return { state: "loading" };
  if (!section.ok) return { state: "unreadable", message: section.message };
  const worst = section.items.map(({ module }) => worstCheck(module.checks));
  return {
    state: "read",
    count: section.items.length,
    failing: worst.filter((state) => state === "fail").length,
    warning: worst.filter((state) => state === "warn").length,
  };
}

const SUMMARY_TONE: Record<"ok" | "warn" | "error" | "idle", string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-destructive",
  idle: "text-muted-foreground",
};

function healthSummary(health: KindHealth): {
  tone: keyof typeof SUMMARY_TONE;
  icon?: LucideIcon;
  text: string;
  title?: string;
} {
  switch (health.state) {
    case "loading":
      return { tone: "idle", text: "" };
    case "unreadable":
      return {
        tone: "error",
        icon: CircleX,
        text: "Could not read",
        title: health.message,
      };
    case "read":
      if (health.count === 0) return { tone: "idle", text: "None yet" };
      if (health.failing > 0)
        return {
          tone: "error",
          icon: CircleX,
          text: `${health.failing} failing`,
        };
      if (health.warning > 0)
        return {
          tone: "warn",
          icon: TriangleAlert,
          text: plural(health.warning, "warning"),
        };
      return { tone: "ok", icon: CircleCheck, text: "All checks pass" };
  }
}

function ModuleTile({
  kind,
  health,
}: {
  kind: ProjectModuleKind;
  health: KindHealth;
}) {
  const { registry, navigate } = useShell();
  const panel = panelById(registry, MODULE_KINDS[kind].panel);
  const summary = healthSummary(health);
  const SummaryIcon = summary.icon;
  return (
    <button
      type="button"
      data-testid="ph-overview-module"
      data-kind={kind}
      onClick={() => navigate({ panel: panel.id })}
      className="flex min-w-0 cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2.5 text-left outline-none hover:bg-foreground/[0.035] focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
        <panel.icon className="size-3.5 shrink-0" />
        <span className="truncate">{panel.title}</span>
      </span>
      <span
        data-testid="ph-overview-module-count"
        className="text-xl leading-tight font-medium tabular-nums"
      >
        {health.state === "read" ? (
          health.count
        ) : health.state === "loading" ? (
          <Skeleton className="h-5 w-6" />
        ) : (
          "–"
        )}
      </span>
      <span
        data-testid="ph-overview-module-health"
        title={summary.title}
        className={cn(
          "flex min-h-4 min-w-0 items-center gap-1 text-[11.5px]",
          SUMMARY_TONE[summary.tone],
        )}
      >
        {SummaryIcon && <SummaryIcon className="size-3 shrink-0" />}
        <span className="truncate">{summary.text}</span>
      </span>
    </button>
  );
}

export function ModuleKindsSection() {
  const view = useProject();
  const snapshot = view.state === "ready" ? view.snapshot : undefined;
  const healths = MODULE_KIND_ORDER.map(
    (kind) =>
      [kind, kindHealth(snapshot && projectModules(snapshot, kind))] as const,
  );
  const read = healths.flatMap(([, h]) => (h.state === "read" ? [h] : []));
  const warning = read.reduce((n, h) => n + h.warning, 0);
  const failing = read.reduce((n, h) => n + h.failing, 0);
  const total = read.reduce((n, h) => n + h.count, 0);
  return (
    <Section
      title="Modules"
      data-testid="ph-overview-modules"
      actions={
        view.state === "unavailable" ? (
          <span className="text-destructive">Project not read</span>
        ) : snapshot && warning + failing > 0 ? (
          <>
            {warning > 0 && (
              <span className="text-warning">{plural(warning, "warning")}</span>
            )}
            {failing > 0 && (
              <span className="text-destructive">{failing} failing</span>
            )}
          </>
        ) : (
          snapshot && plural(total, "module")
        )
      }
    >
      <div className="grid grid-cols-2 gap-2 @md/main:grid-cols-3 @3xl/main:grid-cols-5">
        {healths.map(([kind, health]) => (
          <ModuleTile key={kind} kind={kind} health={health} />
        ))}
      </div>
    </Section>
  );
}
