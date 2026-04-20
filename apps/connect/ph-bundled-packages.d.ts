declare module "ph-bundled-packages-virtual" {
  import type { IPackageManager } from "@powerhousedao/reactor-browser";
  const registerBundledPackages: (packageManager: IPackageManager) => void;
  export default registerBundledPackages;
}
