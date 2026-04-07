import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";

import { Modal } from "#design-system";
import { twMerge } from "tailwind-merge";

const buttonStyles =
  "min-h-[36px] text-sm font-semibold py-2 px-4 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";

export interface PendingPackageInstallation {
  documentType: string;
  packageName: string;
}

export type PackageInstallModalProps = ComponentPropsWithoutRef<
  typeof Modal
> & {
  readonly pendingInstallations: PendingPackageInstallation[];
  readonly onInstall: (packageName: string) => Promise<void>;
  readonly onDismiss: (packageName: string) => void;
};

interface GroupedInstallation {
  packageName: string;
  documentTypes: string[];
}

function groupByPackage(
  installations: PendingPackageInstallation[],
): GroupedInstallation[] {
  const groups = new Map<string, string[]>();
  for (const item of installations) {
    const existing = groups.get(item.packageName) ?? [];
    existing.push(item.documentType);
    groups.set(item.packageName, existing);
  }
  return Array.from(groups.entries()).map(([packageName, documentTypes]) => ({
    packageName,
    documentTypes,
  }));
}

export function PackageInstallModal(props: PackageInstallModalProps) {
  const {
    pendingInstallations,
    onInstall,
    onDismiss,
    open,
    onOpenChange,
    overlayProps,
    contentProps,
    ...restProps
  } = props;

  const [installingPackages, setInstallingPackages] = useState<Set<string>>(
    () => new Set(),
  );

  const grouped = groupByPackage(pendingInstallations);

  async function handleInstall(packageName: string) {
    setInstallingPackages((prev) => new Set(prev).add(packageName));
    try {
      await onInstall(packageName);
    } finally {
      setInstallingPackages((prev) => {
        const next = new Set(prev);
        next.delete(packageName);
        return next;
      });
    }
  }

  if (grouped.length === 0) return null;

  return (
    <Modal
      open={open ?? grouped.length > 0}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          for (const { packageName } of grouped) {
            onDismiss(packageName);
          }
        }
        onOpenChange?.(isOpen);
      }}
      contentProps={{
        ...contentProps,
        className: twMerge("rounded-3xl", contentProps?.className),
      }}
      overlayProps={{
        ...overlayProps,
        className: overlayProps?.className,
      }}
      {...restProps}
    >
      <div className="w-[460px] p-6 text-slate-300">
        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
          {grouped.length === 1 ? "Package Required" : "Packages Required"}
        </div>
        <div className="my-4 text-sm text-gray-600">
          {grouped.length === 1
            ? "A document requires a package that is not installed."
            : "Documents require packages that are not installed."}
        </div>
        <div className="flex flex-col gap-3">
          {grouped.map(({ packageName, documentTypes }) => {
            const installing = installingPackages.has(packageName);
            return (
              <div key={packageName} className="rounded-xl bg-slate-50 p-4">
                <div className="mb-1 text-sm font-semibold text-gray-800">
                  {packageName}
                </div>
                <div className="mb-3 text-xs text-gray-500">
                  Required for document type
                  {documentTypes.length > 1 ? "s" : ""}:{" "}
                  {documentTypes.join(", ")}
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onDismiss(packageName)}
                    disabled={installing}
                    className={twMerge(
                      buttonStyles,
                      "border border-slate-200 bg-white text-slate-800",
                      installing && "cursor-not-allowed opacity-50",
                    )}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleInstall(packageName)}
                    disabled={installing}
                    className={twMerge(
                      buttonStyles,
                      "bg-gray-800 text-gray-50",
                      installing && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {installing ? "Installing..." : "Install"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
