import { findStagePage, STAGES, type StagePageId } from "./layout.js";

export const PLACEHOLDER_NOTE =
  "Placeholder in the first version. This page comes from Vetra Labs.";
export const PLACEHOLDER_ANNOTATION =
  "Annotation: the Vetra Labs screen that belongs here.";

export type PlaceholderProps = {
  page: StagePageId;
  /** The Vetra Labs screenshot of the page. */
  image?: string;
  /** Where "Open in Vetra Labs" leads; without it the link is left out. */
  labsUrl?: string;
  onOpenPage: (page: StagePageId) => void;
};

/** A Build or Deploy page of the first version: the Labs screen it stands for. */
export function Placeholder({
  page,
  image,
  labsUrl,
  onOpenPage,
}: PlaceholderProps) {
  const found = findStagePage(page);
  if (!found) return null;
  const { stage } = found;
  const parent = found.page.parent
    ? findStagePage(found.page.parent)?.page
    : undefined;
  // The page reached from this one's screenshot.
  const detail = STAGES.flatMap((s) => s.pages).find((p) => p.parent === page);
  const title = `${stage.label} · ${found.page.label}`;

  const screenshot = image ? (
    <img
      src={image}
      alt={`Vetra Labs: ${found.page.label}`}
      className="block w-full"
    />
  ) : null;

  return (
    <section
      aria-label={title}
      data-stage-page={page}
      className="mx-auto w-full max-w-5xl px-10 py-8"
    >
      {parent ? (
        <button
          type="button"
          onClick={() => onOpenPage(parent.id)}
          className="mb-3 text-sm text-muted-foreground hover:text-foreground"
        >
          ← {parent.label}
        </button>
      ) : null}
      <h1 className="text-xl font-semibold tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{PLACEHOLDER_NOTE}</p>
      {labsUrl ? (
        <a
          href={labsUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-9 items-center rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground hover:bg-accent"
        >
          Open in Vetra Labs ↗
        </a>
      ) : null}
      {screenshot ? (
        <figure className="mt-6">
          {detail ? (
            <button
              type="button"
              aria-label={`Open ${detail.label.toLowerCase()}`}
              onClick={() => onOpenPage(detail.id)}
              className="block w-full overflow-hidden rounded-md border border-border"
            >
              {screenshot}
            </button>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              {screenshot}
            </div>
          )}
          <figcaption className="mt-2 text-xs text-muted-foreground">
            {PLACEHOLDER_ANNOTATION}
          </figcaption>
        </figure>
      ) : null}
    </section>
  );
}
