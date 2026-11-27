import { ChevronRight, ExternalLink } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { ProjectDocumentModel } from "../../api.js";
import { SectionLabel } from "../../components/section.js";
import { LINK_CLASS, Mono } from "../../components/text.js";
import { cn } from "../../lib/cn.js";
import { CopyButton } from "../../components/copy-button.js";

type Fact = { label: string; value: ReactNode; testId?: string };

function facts(model: ProjectDocumentModel): Fact[] {
  return [
    {
      label: "Document type",
      testId: "ph-model-type",
      value: (
        <span className="flex min-w-0 items-center gap-1">
          <Mono className="min-w-0 break-all">{model.documentType}</Mono>
          <CopyButton text={model.documentType} />
        </span>
      ),
    },
    ...(model.extension
      ? [
          {
            label: "Extension",
            testId: "ph-model-extension",
            value: <Mono>{model.extension}</Mono>,
          },
        ]
      : []),
    ...(model.author
      ? [{ label: "Author", testId: "ph-model-author", value: model.author }]
      : []),
    ...(model.authorWebsite
      ? [
          {
            label: "Website",
            testId: "ph-model-website",
            value: <Website url={model.authorWebsite} />,
          },
        ]
      : []),
    {
      label: "Source",
      testId: "ph-model-source",
      value: (
        <Mono className="break-all">
          {model.source.slice(model.folder.length + 1)}
        </Mono>
      ),
    },
    {
      label: "Folder",
      testId: "ph-model-folder",
      value: <Mono className="break-all">{model.folder}/</Mono>,
    },
  ];
}

/** The project's own text: a link only when it is an http(s) URL. */
function Website({ url }: { url: string }) {
  const web = /^https?:\/\//i.test(url);
  if (!web) return <span className="break-all">{url}</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        LINK_CLASS,
        "inline-flex min-w-0 items-center gap-1 break-all",
      )}
    >
      {url.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
      <ExternalLink
        aria-hidden
        className="size-3 shrink-0 text-muted-foreground"
      />
    </a>
  );
}

/**
 * What the model's code says besides its name and version. Its layout follows
 * the panel's width: a card beside the model when wide, a grid under the
 * title in between, and folded away below the status when narrow.
 */
export function ModelMeta({
  model,
  className,
}: {
  model: ProjectDocumentModel;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rows = facts(model);
  return (
    <aside
      aria-label={`${model.name} metadata`}
      data-testid="ph-model-meta"
      className={cn(
        "min-w-0 text-[13px] @4xl/main:sticky @4xl/main:top-0 @4xl/main:self-start @4xl/main:rounded-md @4xl/main:border @4xl/main:p-3",
        className,
      )}
    >
      <SectionLabel as="h3" className="mb-2 hidden @lg/main:flex">
        Metadata
      </SectionLabel>
      <button
        type="button"
        aria-expanded={open}
        aria-controls="ph-model-facts"
        data-testid="ph-model-meta-toggle"
        onClick={() => setOpen(!open)}
        className="mb-2 flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 @lg/main:hidden"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <SectionLabel as="span">Metadata</SectionLabel>
      </button>
      <dl
        id="ph-model-facts"
        data-testid="ph-model-facts"
        className={cn(
          "grid-cols-[6.5rem_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5",
          "@lg/main:grid @lg/main:grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)]",
          "@4xl/main:grid-cols-1 @4xl/main:gap-y-0",
          open ? "grid" : "hidden",
        )}
      >
        {rows.map(({ label, value, testId }, i) => (
          <div key={label} className="contents">
            <dt
              className={cn(
                "text-[12px] text-muted-foreground @4xl/main:text-[11px]",
                i > 0 && "@4xl/main:mt-2",
              )}
            >
              {label}
            </dt>
            <dd data-testid={testId} className="min-w-0 break-words">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
