import { useState } from "react";
import { twMerge } from "tailwind-merge";

export interface DismissedPackageInfo {
  packageName: string;
  documentTypes: string[];
}

export interface DismissedPackagesListProps {
  dismissedPackages: DismissedPackageInfo[];
  onInstall: (packageName: string) => Promise<void>;
  className?: string;
}

export const DismissedPackagesList: React.FC<DismissedPackagesListProps> = (
  props,
) => {
  const { dismissedPackages, onInstall, className } = props;
  const [installingPackages, setInstallingPackages] = useState<Set<string>>(
    () => new Set(),
  );

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

  if (dismissedPackages.length === 0) return null;

  return (
    <div className={twMerge("rounded-lg p-3", className)}>
      <h3 className="mb-3 font-semibold text-gray-900">Missing Packages</h3>
      <p className="mb-3 text-sm text-gray-500">
        These packages were requested during sync but dismissed. Install them to
        sync the associated documents.
      </p>
      <ul className="flex flex-col gap-2">
        {dismissedPackages.map((dismissed) => {
          const installing = installingPackages.has(dismissed.packageName);
          return (
            <li
              key={dismissed.packageName}
              className="flex items-center justify-between rounded-md border border-gray-200 p-3 shadow-sm"
            >
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {dismissed.packageName}
                </p>
                <p className="text-xs text-gray-500">
                  Document types: {dismissed.documentTypes.join(", ")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleInstall(dismissed.packageName)}
                disabled={installing}
                className={twMerge(
                  "rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-semibold text-white transition-all hover:scale-105 active:opacity-75",
                  installing && "cursor-not-allowed opacity-50",
                )}
              >
                {installing ? "Installing..." : "Install"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
