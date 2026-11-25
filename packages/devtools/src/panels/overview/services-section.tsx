import { ExternalLink } from "lucide-react";
import type { DevStackInfo } from "../../api.js";
import { CopyButton } from "../../components/copy-button.js";
import { Skeleton } from "../../components/loading.js";
import { Section } from "../../components/section.js";
import { StatusDot, Tag, type Tone } from "../../components/status.js";
import { Muted } from "../../components/text.js";
import { cn } from "../../lib/cn.js";
import { buttonVariants } from "../../ui/button.js";
import { useReach, type Reach } from "./use-reach.js";

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
          <Skeleton className="w-16" />
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
          <Skeleton className="w-52 max-w-full" />
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

export function ServicesSection({ info }: { info: DevStackInfo | null }) {
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
