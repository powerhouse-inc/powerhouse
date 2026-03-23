import { Modal } from "@powerhousedao/design-system";
import type { RegistryPackage } from "@powerhousedao/shared/registry";
import { useState, type ComponentPropsWithoutRef } from "react";
import { twMerge } from "tailwind-merge";

type Props = ComponentPropsWithoutRef<typeof Modal> & {
  documentType: string;
  requiredPackages: RegistryPackage[];
  onInstall: (packageName: string) => Promise<void>;
  onDismiss: (packageName: string) => void;
};
export function MissingPackageModal(props: Props) {
  const {
    documentType,
    requiredPackages,
    open,
    onInstall,
    onDismiss,
    onOpenChange,
  } = props;
  const [installingPackages, setInstallingPackages] = useState<string[]>([]);

  function isInstalling(packageName: string) {
    return installingPackages.includes(packageName);
  }

  function addInstallingPackage(packageName: string) {
    setInstallingPackages((previous) => [
      ...new Set([...previous, packageName]),
    ]);
  }

  function removeInstallingPackage(packageName: string) {
    setInstallingPackages((previous) => [
      ...new Set(previous.filter((ip) => ip !== packageName)),
    ]);
  }

  function handleInstall(packageName: string) {
    addInstallingPackage(packageName);
    onInstall(packageName).then(
      () => {
        removeInstallingPackage(packageName);
      },
      () => {
        removeInstallingPackage(packageName);
      },
    );
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <div className="w-[460px] p-6 text-slate-300">
        <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
          {requiredPackages.length === 1
            ? "Package Required"
            : "Packages Required"}
        </div>
        <div className="my-4 text-sm text-gray-600">
          {requiredPackages.length === 1
            ? "A document requires a package that is not installed."
            : "Documents require packages that are not installed."}
        </div>
        <div className="flex flex-col gap-3">
          {requiredPackages.map(({ name }) => {
            return (
              <div key={name} className="rounded-xl bg-slate-50 p-4">
                <div className="mb-1 text-sm font-semibold text-gray-800">
                  {name}
                </div>
                <div className="mb-3 text-xs text-gray-500">
                  Required for document type "{documentType}"
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => onDismiss(name)}
                    disabled={isInstalling(name)}
                    className={twMerge(
                      "border border-slate-200 bg-white text-slate-800",
                      isInstalling(name) && "cursor-not-allowed opacity-50",
                    )}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInstall(name)}
                    disabled={isInstalling(name)}
                    className={twMerge(
                      "bg-gray-800 text-gray-50",
                      isInstalling(name) && "cursor-not-allowed opacity-50",
                    )}
                  >
                    {isInstalling(name) ? "Installing..." : "Install"}
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
