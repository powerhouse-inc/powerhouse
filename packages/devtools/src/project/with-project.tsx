import { FileWarning, FileX2, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import type { ProjectModuleKind, ProjectSnapshot } from "../api.js";
import { CopyCommand } from "../components/copy-button.js";
import { EmptyState } from "../components/empty-state.js";
import { Loading } from "../components/loading.js";
import { StatusDot } from "../components/status.js";
import { Mono } from "../components/text.js";
import { cn } from "../lib/cn.js";
import { ApiUnavailable } from "../shell/api-unavailable.js";
import { panelById } from "../shell/location.js";
import { useShell } from "../shell/state.js";
import { MODULE_KINDS } from "./kinds.js";
import { useProject } from "./provider.js";
import type { DataAttributes } from "../lib/data-attributes.js";

/** Says that what is on screen is the last good read, and why. A page whose
 * token the server no longer accepts gets the way out too. */
export function StaleNote({
  message,
  reload = false,
  className,
  ...data
}: { message: string; reload?: boolean; className?: string } & DataAttributes) {
  return (
    <p
      role="status"
      {...data}
      title={message}
      className={cn(
        "mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-warning",
        className,
      )}
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
  noteClassName,
}: {
  children: (snapshot: ProjectSnapshot) => ReactNode;
  /** For the note that the page shows the last good read. */
  noteClassName?: string;
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
          className={noteClassName}
          reload={view.staleCode === "bad_token"}
        />
      )}
      {children(view.snapshot)}
    </>
  );
}

/** A kind's page when the project has no module of the kind. */
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

/** A kind's page when the project's modules of the kind could not be read. */
export function SectionError({
  kind,
  message,
}: {
  kind: ProjectModuleKind;
  message: string;
}) {
  return (
    <EmptyState
      data-testid="ph-section-error"
      data-kind={kind}
      icon={FileWarning}
      tone="error"
      role="alert"
      title={`Could not read the ${MODULE_KINDS[kind].noun}s`}
      reason={message}
    >
      The other pages are not affected. This one reads again when the
      project&apos;s files change.
    </EmptyState>
  );
}
