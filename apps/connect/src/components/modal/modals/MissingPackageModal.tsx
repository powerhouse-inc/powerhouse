import { useRegistryPackages } from "@powerhousedao/connect/hooks";
import { MissingPackageModal } from "@powerhousedao/design-system/connect/index";
import {
  closePHModal,
  usePHModal,
  useVetraPackageManager,
} from "@powerhousedao/reactor-browser";

export function ConnectMissingPackageModal() {
  const phModal = usePHModal();
  const { registryPackageList, updateRegistryPackageStatus } =
    useRegistryPackages();
  const packageManager = useVetraPackageManager();
  const open = phModal?.type === "missingPackage";

  const documentType = open ? phModal.documentType : undefined;

  if (!packageManager || !documentType) return null;

  async function onInstall(packageName: string) {
    const result = await packageManager?.addPackage(packageName);
    if (result?.type === "success") {
      updateRegistryPackageStatus(packageName, "registry-install");
    }
  }

  function onDismiss(packageName: string) {
    updateRegistryPackageStatus(packageName, "dismissed");
  }

  const requiredPackages = registryPackageList.filter((rp) =>
    rp.documentTypes.includes(documentType),
  );

  return (
    <MissingPackageModal
      documentType={documentType}
      requiredPackages={requiredPackages}
      open={open}
      onInstall={onInstall}
      onDismiss={onDismiss}
      onOpenChange={(status: boolean) => {
        if (!status) return closePHModal();
      }}
    />
  );
}
