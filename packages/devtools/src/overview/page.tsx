import {
  CircleCheck,
  CircleX,
  ExternalLink,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  DevStackInfo,
  ProjectModuleKind,
  ProjectSection,
} from "../api.js";
import { CopyButton, CopyCommand } from "../build/project/parts.js";
import {
  MODULE_KIND_ORDER,
  MODULE_KINDS,
  projectModules,
  worstCheck,
  type ProjectModule,
} from "../build/project/kinds.js";
import { useProject } from "../build/project/provider.js";
import { plural } from "../lib/plural.js";
import {
  Code,
  KV,
  RelTime,
  Section,
  StatusDot,
  Tag,
  type Tone,
} from "../kit.js";
import { cn } from "../lib/cn.js";
import { buttonVariants } from "../ui/button.js";
import { ApiUnavailable } from "../shell/api-unavailable.js";
import { panelById } from "../shell/location.js";
import { useShell } from "../shell/state.js";
import { useDevtoolsInfo } from "../shell/use-info.js";

function Muted({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

function LoadingBar({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-3 rounded-sm bg-foreground/10 align-middle ${className}`}
    />
  );
}

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
          <LoadingBar className="h-5 w-6" />
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

function ModulesSection() {
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
      aside={
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

type Reach = "checking" | "up" | "down";

const PROBE_MS = 5000;
const PROBE_TIMEOUT_MS = 3000;

/** Whether anything answers at the URL. `no-cors` gives an opaque response,
 * which is enough to know the port is served. */
function useReach(url: string | null | undefined): Reach {
  const [probed, setProbed] = useState<{ url: string; reach: Reach }>();
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let timer: number | undefined;
    const probe = async () => {
      if (document.visibilityState !== "hidden") {
        const controller = new AbortController();
        const timeout = window.setTimeout(
          () => controller.abort(),
          PROBE_TIMEOUT_MS,
        );
        let next: Reach;
        try {
          await fetch(url, {
            method: "HEAD",
            mode: "no-cors",
            cache: "no-store",
            signal: controller.signal,
          });
          next = "up";
        } catch {
          next = "down";
        } finally {
          window.clearTimeout(timeout);
          // Closes a response that streams, such as an MCP event stream.
          controller.abort();
        }
        if (cancelled) return;
        setProbed({ url, reach: next });
      }
      timer = window.setTimeout(() => void probe(), PROBE_MS);
    };
    void probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [url]);
  return probed && probed.url === url ? probed.reach : "checking";
}

const REACH_TAG: Record<Reach | "off", { tone: Tone; label: string }> = {
  checking: { tone: "idle", label: "Checking" },
  up: { tone: "ok", label: "Listening" },
  down: { tone: "error", label: "Not answering" },
  off: { tone: "idle", label: "Not running" },
};

const SERVICE_GRID =
  "grid grid-cols-[minmax(5.5rem,auto)_auto_minmax(0,1fr)_3.25rem] items-center gap-x-3 @xl/main:grid-cols-[10rem_8rem_minmax(0,1fr)_3.25rem]";

function ServiceRow({
  name,
  role,
  field,
  url,
}: {
  name: string;
  role: string;
  field: string;
  url: string | null | undefined;
}) {
  const reach = useReach(url);
  const status = REACH_TAG[url === null ? "off" : reach];
  return (
    <div
      data-testid="ph-overview-service"
      data-service={field}
      data-reach={url === null ? "off" : url === undefined ? undefined : reach}
      className={cn(SERVICE_GRID, "min-h-8 rounded-md px-2 hover:bg-muted/50")}
    >
      <span className="min-w-0 truncate font-medium">
        {name}
        <span className="hidden font-normal text-muted-foreground @xl/main:inline">
          {" "}
          · {role}
        </span>
      </span>
      <span>
        {url === undefined ? (
          <LoadingBar className="w-16" />
        ) : (
          <Tag tone={status.tone}>
            <StatusDot tone={status.tone} className="size-1.5" />
            {status.label}
          </Tag>
        )}
      </span>
      <span data-testid={`ph-info-${field}`} className="min-w-0 truncate">
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-primary underline-offset-2 hover:underline"
          >
            {url}
          </a>
        ) : url === null ? (
          <Muted>—</Muted>
        ) : (
          <LoadingBar className="w-52 max-w-full" />
        )}
      </span>
      <span className="flex justify-end">
        {url && (
          <>
            <CopyButton text={url} />
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open ${url}`}
              title={`Open ${url}`}
              className={buttonVariants({ variant: "ghost", size: "icon-xs" })}
            >
              <ExternalLink />
            </a>
          </>
        )}
      </span>
    </div>
  );
}

function ServicesSection({ info }: { info: DevStackInfo | null }) {
  const services = [
    ["App", "Dev server", "app-url", info?.app.url],
    ["Switchboard", "GraphQL", "switchboard-url", info?.switchboard.url],
    ["MCP", "Agents", "mcp-url", info?.mcp.url],
  ] as const;
  return (
    <Section title="Services">
      <div className="text-[12px]">
        <div
          aria-hidden
          className={cn(
            SERVICE_GRID,
            "hidden min-h-6 px-2 text-[11px] text-muted-foreground @xl/main:grid",
          )}
        >
          <span>Service</span>
          <span>Status</span>
          <span>Address</span>
        </div>
        {services.map(([name, role, field, url]) => (
          <ServiceRow
            key={field}
            name={name}
            role={role}
            field={field}
            url={url}
          />
        ))}
      </div>
    </Section>
  );
}

function startedAt(info: DevStackInfo): number | null {
  const at = info.startedAt ? Date.parse(info.startedAt) : NaN;
  return Number.isNaN(at) ? null : at;
}

function ProjectSection({ info }: { info: DevStackInfo | null }) {
  const view = useProject();
  const at = info && startedAt(info);
  const root =
    view.state === "ready" ? (
      <span className="-my-1 flex min-w-0 items-center gap-1">
        <span
          data-testid="ph-info-root"
          title={view.snapshot.root}
          className="min-w-0 truncate font-mono"
        >
          {view.snapshot.root}
        </span>
        <CopyButton text={view.snapshot.root} />
      </span>
    ) : view.state === "loading" ? (
      <LoadingBar className="w-48 max-w-full" />
    ) : (
      <Muted>unknown</Muted>
    );
  const value = (bar: string, node: (info: DevStackInfo) => ReactNode) =>
    info ? node(info) : <LoadingBar className={bar} />;
  return (
    <Section title="Project">
      <KV
        rows={[
          [
            "Package",
            value("w-40", (i) => (
              <span data-testid="ph-info-project">
                {i.project.name ?? <Muted>unknown</Muted>}
              </span>
            )),
          ],
          [
            "Version",
            value("w-12", (i) => (
              <span data-testid="ph-info-version" className="font-mono">
                {i.project.version ?? <Muted>unknown</Muted>}
              </span>
            )),
          ],
          [
            "ph CLI",
            value("w-24", (i) => (
              <span data-testid="ph-info-ph-version" className="font-mono">
                {i.ph.version === "unknown" ? (
                  <Muted>unknown</Muted>
                ) : (
                  i.ph.version
                )}
              </span>
            )),
          ],
          [
            "Started",
            value("w-16", () =>
              at ? (
                <span>
                  {new Date(at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                  <Muted>
                    {" · "}
                    <span data-testid="ph-info-started-at">
                      <RelTime at={at} />
                    </span>
                  </Muted>
                </span>
              ) : (
                <span data-testid="ph-info-started-at">
                  <Muted>unknown</Muted>
                </span>
              ),
            ),
          ],
          ["Root", root],
        ]}
      />
    </Section>
  );
}

/** The `reactor-mcp` entry `ph init` writes for each agent: `.mcp.json`,
 * `.cursor/mcp.json` and `.gemini/settings.json`. */
const AGENTS = [
  {
    id: "claude",
    title: "Claude Code",
    file: ".mcp.json",
    command: "claude mcp add --scope project reactor-mcp -- node --run mcp",
    server: { type: "stdio", command: "node", args: ["--run", "mcp"] },
  },
  {
    id: "cursor",
    title: "Cursor",
    file: ".cursor/mcp.json",
    // Cursor's CLI has no command that adds a server.
    command: null,
    server: {
      type: "stdio",
      command: "node",
      args: [
        "${workspaceFolder}/node_modules/@powerhousedao/ph-cli/dist/cli.mjs",
        "mcp",
        "--project-dir",
        "${workspaceFolder}",
      ],
    },
  },
  {
    id: "gemini",
    title: "Gemini CLI",
    file: ".gemini/settings.json",
    command: "gemini mcp add reactor-mcp node -- --run mcp",
    server: { command: "node", args: ["--run", "mcp"] },
  },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

function AgentSection({ mcpUrl }: { mcpUrl: string | null | undefined }) {
  const [selected, setSelected] = useState<AgentId>("claude");
  const agent = AGENTS.find((a) => a.id === selected) ?? AGENTS[0];
  const config = JSON.stringify(
    { mcpServers: { "reactor-mcp": agent.server } },
    null,
    2,
  );
  return (
    <Section
      title="Connect an agent"
      data-testid="ph-overview-agent"
      data-agent={agent.id}
      tabs={
        <div
          role="tablist"
          aria-label="Agent"
          className="flex rounded-md bg-foreground/[0.06] p-0.5"
        >
          {AGENTS.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === selected}
              data-agent={a.id}
              onClick={() => setSelected(a.id)}
              className={cn(
                "h-6 cursor-pointer rounded-[5px] px-2.5 text-[12px] text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
                a.id === selected && "bg-background text-foreground shadow-xs",
              )}
            >
              {a.title}
            </button>
          ))}
        </div>
      }
    >
      <div
        role="tabpanel"
        className="grid min-w-0 grid-cols-1 gap-2 text-[12px]"
      >
        {agent.command && (
          <>
            <h4 className="mt-1 font-medium">Add it with a command</h4>
            <CopyCommand command={agent.command} className="min-w-0" />
          </>
        )}
        <h4 className="mt-1 font-medium">
          {agent.command ? "Or add it to" : "Add it to"}{" "}
          <span className="font-mono font-normal">{agent.file}</span>
        </h4>
        <div className="relative min-w-0">
          <Code lang="json">{config}</Code>
          <div className="absolute top-1 right-1">
            <CopyButton text={config} />
          </div>
        </div>
        {mcpUrl && (
          <p className="text-muted-foreground">
            Other clients can use{" "}
            <span className="font-mono text-foreground">{mcpUrl}</span> while
            this dev server runs.
          </p>
        )}
      </div>
    </Section>
  );
}

export function OverviewPage() {
  const result = useDevtoolsInfo();
  if (result.state === "unavailable") {
    return (
      <div data-testid="ph-overview" data-state="unavailable">
        <ApiUnavailable
          data-testid="ph-overview-unavailable"
          code={result.code}
          message={result.message}
        />
      </div>
    );
  }

  const info = result.state === "ready" ? result.info : null;
  return (
    <div
      data-testid="ph-overview"
      data-state={result.state}
      aria-busy={!info}
      className="grid grid-cols-1 gap-5"
    >
      <ModulesSection />
      <ServicesSection info={info} />
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 @3xl/main:grid-cols-2">
        <ProjectSection info={info} />
        <AgentSection mcpUrl={info?.mcp.url} />
      </div>
    </div>
  );
}
