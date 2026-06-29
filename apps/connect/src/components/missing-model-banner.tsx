import { Modal } from "@powerhousedao/design-system";
import {
  usePackageDiscoveryService,
  type FailedInstallation,
  type FailedInstallationReason,
} from "@powerhousedao/reactor-browser";
import { useState } from "react";
import { twMerge } from "tailwind-merge";
import { useFailedInstallations } from "../hooks/useFailedInstallations.js";

const reasonLabels: Record<FailedInstallationReason, string> = {
  "no-registry": "No package registry is configured.",
  "not-in-registry": "No matching package found in the registry.",
  "registry-error": "Couldn't reach the package registry.",
  "install-failed": "Package failed to install.",
  dismissed: "Installation was dismissed.",
  offline: "You're offline — this package can't be loaded until you reconnect.",
};

function canRetry(reason: FailedInstallationReason): boolean {
  return reason !== "no-registry";
}

export function MissingModelBanner() {
  const failed = useFailedInstallations();
  const [open, setOpen] = useState(false);

  if (failed.length === 0) return null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-warning/10 px-4 py-2 text-sm text-warning">
        <span>
          {failed.length === 1
            ? "1 document type couldn't load (missing model)."
            : `${failed.length} document types couldn't load (missing models).`}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-warning bg-background px-3 py-1 text-warning hover:hover-effect"
        >
          View
        </button>
      </div>
      <MissingModelDetailsModal
        open={open}
        failed={failed}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

type DetailsProps = {
  readonly open: boolean;
  readonly failed: FailedInstallation[];
  readonly onClose: () => void;
};

function MissingModelDetailsModal(props: DetailsProps) {
  const { open, failed, onClose } = props;
  const discoveryService = usePackageDiscoveryService();
  const [retrying, setRetrying] = useState<Set<string>>(() => new Set());

  async function handleRetry(documentType: string) {
    if (!discoveryService) return;
    setRetrying((prev) => new Set(prev).add(documentType));
    try {
      await discoveryService.retryInstallation(documentType);
    } finally {
      setRetrying((prev) => {
        const next = new Set(prev);
        next.delete(documentType);
        return next;
      });
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      contentProps={{ className: "rounded-3xl" }}
    >
      <div className="w-[520px] max-w-[90vw] bg-background p-6">
        <div className="border-b border-border pb-2 text-2xl font-bold text-foreground">
          Missing document models
        </div>
        <div className="my-4 text-sm text-foreground">
          The following document types couldn't be loaded. Documents using them
          won't display until the underlying package is installed.
        </div>
        {failed.length === 0 ? (
          <div className="rounded-xl bg-background p-4 text-sm text-foreground">
            No outstanding failures.
          </div>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
            {failed.map((entry) => {
              const isRetrying = retrying.has(entry.documentType);
              const retryDisabled = !canRetry(entry.reason) || isRetrying;
              return (
                <div
                  key={entry.documentType}
                  className="rounded-xl bg-background p-4"
                >
                  <div className="mb-1 font-mono text-sm font-semibold text-foreground">
                    {entry.documentType}
                  </div>
                  <div className="mb-2 text-xs text-foreground">
                    {reasonLabels[entry.reason]}
                  </div>
                  {entry.packageNames.length > 0 ? (
                    <div className="mb-2 text-xs text-muted-foreground">
                      Package{entry.packageNames.length > 1 ? "s" : ""}:{" "}
                      {entry.packageNames.join(", ")}
                    </div>
                  ) : null}
                  {entry.error ? (
                    <div className="mb-2 font-mono text-xs wrap-break-word text-destructive">
                      {entry.error.message}
                    </div>
                  ) : null}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void handleRetry(entry.documentType)}
                      disabled={retryDisabled}
                      title={
                        canRetry(entry.reason)
                          ? undefined
                          : "No registry is configured; nothing to retry against."
                      }
                      className={twMerge(
                        "min-h-[32px] rounded-xl px-3 py-1 text-sm font-semibold text-foreground transition-all hover:hover-effect",
                        retryDisabled
                          ? "cursor-not-allowed bg-secondary hover:hover-effect"
                          : "bg-primary text-primary-foreground active:active-effect",
                      )}
                    >
                      {isRetrying ? "Retrying..." : "Try install again"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[36px] rounded-xl border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground hover:hover-effect"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
