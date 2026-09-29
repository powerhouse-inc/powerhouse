import { Icon, PowerhouseButton } from "@powerhousedao/design-system";

/** Boot screen for a reactor that refused this browser's stored documents. */
export function StoredDocumentsRefusedFallback({ error }: { error: Error }) {
  return (
    <div className="z-10 mx-auto flex max-w-[80%] flex-1 items-center justify-center p-6">
      <div
        role="alert"
        className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-foreground shadow-sm"
      >
        <div className="mb-3 flex items-center gap-2">
          <Icon name="Error" className="size-5 shrink-0 text-destructive" />
          <h1 className="text-lg font-semibold text-foreground">
            Connect cannot open this browser&apos;s documents
          </h1>
        </div>
        <p className="mb-4 text-sm wrap-break-word text-foreground">
          {error.message}
        </p>
        <PowerhouseButton
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="px-3 py-1.5 text-base font-medium"
        >
          Reload
        </PowerhouseButton>
      </div>
    </div>
  );
}
