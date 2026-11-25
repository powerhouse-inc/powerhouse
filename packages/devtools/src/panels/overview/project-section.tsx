import type { ReactNode } from "react";
import type { DevStackInfo } from "../../api.js";
import { CopyButton } from "../../components/copy-button.js";
import { DescriptionList } from "../../components/description-list.js";
import { Skeleton } from "../../components/loading.js";
import { RelTime } from "../../components/rel-time.js";
import { Section } from "../../components/section.js";
import { Mono, Muted } from "../../components/text.js";
import { useProject } from "../../project/provider.js";

function startedAt(info: DevStackInfo): number | null {
  const at = info.startedAt ? Date.parse(info.startedAt) : NaN;
  return Number.isNaN(at) ? null : at;
}

export function ProjectSection({ info }: { info: DevStackInfo | null }) {
  const view = useProject();
  const at = info && startedAt(info);
  const root =
    view.state === "ready" ? (
      <span className="-my-1 flex min-w-0 items-center gap-1">
        <Mono
          data-testid="ph-info-root"
          title={view.snapshot.root}
          className="min-w-0 truncate"
        >
          {view.snapshot.root}
        </Mono>
        <CopyButton text={view.snapshot.root} />
      </span>
    ) : view.state === "loading" ? (
      <Skeleton className="w-48 max-w-full" />
    ) : (
      <Muted>unknown</Muted>
    );
  const value = (bar: string, node: (info: DevStackInfo) => ReactNode) =>
    info ? node(info) : <Skeleton className={bar} />;
  return (
    <Section title="Project">
      <DescriptionList
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
              <Mono data-testid="ph-info-version">
                {i.project.version ?? <Muted>unknown</Muted>}
              </Mono>
            )),
          ],
          [
            "ph CLI",
            value("w-24", (i) => (
              <Mono data-testid="ph-info-ph-version">
                {i.ph.version === "unknown" ? (
                  <Muted>unknown</Muted>
                ) : (
                  i.ph.version
                )}
              </Mono>
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
