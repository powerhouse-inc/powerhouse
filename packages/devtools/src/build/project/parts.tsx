import { Check, Copy, FileWarning, FileX2, RotateCw } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type {
  ProjectCheck,
  ProjectModuleKind,
  ProjectSnapshot,
} from "../../api.js";
import {
  EmptyState,
  Loading,
  Mono,
  StatusDot,
  Tag,
  type Tone,
} from "../../kit.js";
import { cn } from "../../lib/cn.js";
import { ApiUnavailable } from "../../shell/api-unavailable.js";
import { panelById } from "../../shell/location.js";
import { useShell } from "../../shell/state.js";
import { Button } from "../../ui/button.js";
import { plural } from "../../lib/plural.js";
import { MARK_TEXT } from "../ui.js";
import { moduleTarget } from "./focus.js";
import {
  findDocumentModel,
  MODULE_KINDS,
  problemsOf,
  worstCheck,
  type CheckState,
} from "./kinds.js";
import { useProject } from "./provider.js";

const CHECK_TONE: Record<CheckState, Tone> = {
  pass: "ok",
  warn: "warn",
  fail: "error",
};

/** The tone of a module's worst check; idle when it has none. */
export const checksTone = (checks: readonly ProjectCheck[]): Tone => {
  const worst = worstCheck(checks);
  return worst ? CHECK_TONE[worst] : "idle";
};

/** Says that what is on screen is the last good read, and why. A page whose
 * token the server no longer accepts gets the way out too. */
export function StaleNote({
  message,
  reload = false,
  ...data
}: { message: string; reload?: boolean } & {
  [k: `data-${string}`]: string;
}) {
  return (
    <p
      role="status"
      {...data}
      title={message}
      className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-warning"
    >
      <StatusDot tone="warn" className="size-1.5" />
      {reload
        ? "The dev server restarted. Showing the last read."
        : "Could not refresh. Showing the last read."}
      {reload && (
        <button
          type="button"
          data-testid="ph-reload"
          onClick={() => window.location.reload()}
          className="inline-flex cursor-pointer items-center gap-1 underline underline-offset-[3px]"
        >
          <RotateCw className="size-3" />
          Reload the page
        </button>
      )}
    </p>
  );
}

/** The page's content once the project has been read, or why it was not. */
export function WithProject({
  children,
}: {
  children: (snapshot: ProjectSnapshot) => ReactNode;
}) {
  const view = useProject();
  if (view.state === "loading") {
    return (
      <Loading data-testid="ph-project-loading">Reading the project…</Loading>
    );
  }
  if (view.state === "unavailable") {
    if (view.code === "not_found") {
      return (
        <EmptyState
          data-testid="ph-project-unavailable"
          data-code={view.code}
          icon={FileX2}
          role="alert"
          title="This dev server does not read the project"
        >
          Build shows the modules in the project&apos;s code, and the server
          behind this page has no reader for it. Run the app with{" "}
          <Mono>ph vetra</Mono> or <Mono>ph connect</Mono> from the project.
        </EmptyState>
      );
    }
    return (
      <ApiUnavailable
        data-testid="ph-project-unavailable"
        code={view.code}
        message={view.message}
      />
    );
  }
  return (
    <>
      {view.staleMessage && (
        <StaleNote
          data-testid="ph-project-stale"
          message={view.staleMessage}
          reload={view.staleCode === "bad_token"}
        />
      )}
      {children(view.snapshot)}
    </>
  );
}

/** Copies text to the clipboard. `copied` holds for a moment after it worked. */
export function useCopy(): [copied: boolean, copy: (text: string) => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);
  return [
    copied,
    (text) => {
      void navigator.clipboard.writeText(text).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    },
  ];
}

export function CopyButton({ text }: { text: string }) {
  const [copied, copy] = useCopy();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      data-testid="ph-copy"
      aria-label={copied ? "Copied" : `Copy ${text}`}
      title={copied ? "Copied" : `Copy ${text}`}
      onClick={() => copy(text)}
    >
      {copied ? <Check /> : <Copy />}
    </Button>
  );
}

export function CopyCommand({
  command,
  note,
  className,
}: {
  command: string;
  note?: string;
  className?: string;
}) {
  const [copied, copy] = useCopy();
  return (
    <div
      data-testid="ph-command"
      className={cn(
        "flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-foreground/[0.035] py-1.5 pr-1.5 pl-3",
        className,
      )}
    >
      <Mono className="min-w-0 text-[12px] break-words">{command}</Mono>
      {note && (
        <span className="min-w-0 text-[12px] text-muted-foreground">
          {note}
        </span>
      )}
      <Button
        variant="outline"
        size="xs"
        data-testid="ph-copy"
        aria-label={`Copy ${command}`}
        className="ml-auto"
        onClick={() => copy(command)}
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function EmptyKind({ kind }: { kind: ProjectModuleKind }) {
  const { registry } = useShell();
  const { noun, about, command, panel } = MODULE_KINDS[kind];
  return (
    <EmptyState
      data-testid="ph-kind-empty"
      data-kind={kind}
      icon={panelById(registry, panel).icon}
      title={`No ${noun}s in this project`}
      action={
        <>
          <p className="mb-1.5 text-center text-[12px] text-muted-foreground">
            Create one from the project&apos;s folder:
          </p>
          <CopyCommand command={command} />
        </>
      }
    >
      {about}
    </EmptyState>
  );
}

export function SectionError({
  kind,
  message,
  inline = false,
}: {
  kind: ProjectModuleKind;
  message: string;
  /** Among other content, where the page itself still has something to show. */
  inline?: boolean;
}) {
  const title = `Could not read the ${MODULE_KINDS[kind].noun}s`;
  if (inline) {
    return (
      <section
        role="alert"
        data-testid="ph-section-error"
        data-kind={kind}
        className="flex min-w-0 gap-2.5 rounded-md border border-destructive/25 bg-destructive/[0.06] px-3 py-2 text-[13px]"
      >
        <FileWarning
          aria-hidden
          className="mt-0.5 size-3.5 shrink-0 text-destructive"
        />
        <div className="min-w-0">
          <h3 className="font-medium">{title}</h3>
          <p className="mt-0.5 font-mono text-[11.5px] [overflow-wrap:anywhere] whitespace-pre-line text-muted-foreground">
            {message}
          </p>
        </div>
      </section>
    );
  }
  return (
    <EmptyState
      data-testid="ph-section-error"
      data-kind={kind}
      icon={FileWarning}
      tone="error"
      role="alert"
      title={title}
      reason={message}
    >
      The other pages are not affected. This one reads again when the
      project&apos;s files change.
    </EmptyState>
  );
}

/** A module's checks in one chip: how many pass, or how many do not. */
export function ChecksTag({ checks }: { checks: readonly ProjectCheck[] }) {
  if (checks.length === 0) return null;
  const problems = problemsOf(checks);
  const tone = checksTone(checks);
  return (
    <Tag
      tone={tone}
      data-testid="ph-checks-summary"
      data-state={worstCheck(checks)}
      title={problems.map((check) => check.label).join("\n") || undefined}
      className="gap-1.5"
    >
      <StatusDot tone={tone} className="size-1.5" />
      {problems.length > 0
        ? plural(problems.length, "problem")
        : `${plural(checks.length, "check")} ${checks.length === 1 ? "passes" : "pass"}`}
    </Tag>
  );
}

export type CheckRow = {
  id: string;
  tone: Tone;
  label: string;
  detail?: string;
};

export const checkRows = (checks: readonly ProjectCheck[]): CheckRow[] =>
  checks.map((check) => ({
    id: check.id,
    tone: CHECK_TONE[check.state],
    label: check.label,
    ...(check.state !== "pass" && check.detail && { detail: check.detail }),
  }));

/** Whether Connect loaded the module in this tab, as one more row. */
export const loadedRow = (loaded: boolean): CheckRow => ({
  id: "loaded",
  tone: loaded ? "ok" : "idle",
  label: loaded ? "Loaded in this tab" : "Not loaded in this tab",
});

/** Server text with its `quoted` names and commands set as code. */
export function Prose({ text }: { text: string }) {
  return text
    .split("`")
    .map((part, index) =>
      index % 2 === 1 ? <Mono key={index}>{part}</Mono> : part,
    );
}

export function Checks({ rows }: { rows: readonly CheckRow[] }) {
  if (rows.length === 0) {
    return <p className="text-[13px] text-muted-foreground">None.</p>;
  }
  return (
    <ul data-testid="ph-checks" className="space-y-1.5 text-[13px]">
      {rows.map((row) => (
        <li
          key={row.id}
          data-testid="ph-check"
          data-check={row.id}
          data-tone={row.tone}
          className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2"
        >
          <StatusDot tone={row.tone} className="size-1.5 -translate-y-px" />
          <span className={cn("min-w-0 break-words", MARK_TEXT[row.tone])}>
            {row.label}
          </span>
          {row.detail && (
            <span className="col-start-2 min-w-0 text-[12px] break-words text-muted-foreground">
              <Prose text={row.detail} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A file's path as its module shows it: relative to the module's folder. */
export const belowFolder = (file: string, folder: string) =>
  file.startsWith(`${folder}/`) ? file.slice(folder.length + 1) : file;

/** Document types, each linked to the project's model when it has one. */
export function DocumentTypes({
  types,
  snapshot,
  none = "none",
}: {
  types: readonly string[];
  snapshot: ProjectSnapshot;
  none?: string;
}) {
  const { navigate } = useShell();
  if (types.length === 0) {
    return <span className="text-muted-foreground">{none}</span>;
  }
  return (
    <span className="flex flex-col gap-0.5">
      {types.map((type) => {
        const model = findDocumentModel(snapshot, type);
        if (!model) return <Mono key={type}>{type}</Mono>;
        return (
          <button
            key={type}
            type="button"
            data-testid="ph-document-type-link"
            data-document-type={type}
            title={`Show ${model.name} in Document models`}
            onClick={() => navigate(moduleTarget("document-model", type))}
            className="group/type inline-flex min-w-0 cursor-pointer flex-wrap items-baseline gap-x-1.5 text-left"
          >
            <Mono className="underline decoration-foreground/25 underline-offset-[3px] group-hover/type:decoration-foreground">
              {type}
            </Mono>
            <span className="text-[12px] text-muted-foreground">
              → {model.name}
            </span>
          </button>
        );
      })}
    </span>
  );
}
