import type { Meta, StoryObj } from "@storybook/react";

import type { RegistryPackage } from "@powerhousedao/shared/registry";
import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import { mockPackages } from "../mocks.js";
import { PackageManager } from "./package-manager.js";

const mixedStatusPackages: RegistryPackage[] = mockPackages.map((pkg, i) => {
  if (i === 0) return { ...pkg, status: "local-install" };
  if (i === 1 || i === 2) return { ...pkg, status: "registry-install" };
  if (i === 3) return { ...pkg, status: "dismissed" };
  return pkg;
});

const onlyAvailablePackages: RegistryPackage[] = mockPackages.map((pkg) => ({
  ...pkg,
  status: "available",
}));

const onlyLocallyInstalledPackages: RegistryPackage[] = mockPackages
  .slice(0, 3)
  .map((pkg) => ({ ...pkg, status: "local-install" }));

const meta: Meta<typeof PackageManager> = {
  title: "Connect/Components/PackageManager",
  component: PackageManager,
  excludeStories: ["PackageManagerWrapper"],
};

export default meta;
type Story = StoryObj<typeof meta>;

type Props = ComponentPropsWithoutRef<typeof PackageManager>;

const baseArgs: Partial<Props> = {
  registryPackageList: mockPackages,
  mutable: true,
};

export function PackageManagerWrapper() {
  const [registryPackageList, setPackages] = useState(
    baseArgs.registryPackageList ?? [],
  );
  return (
    <PackageManager
      onInstall={(packageName) => {
        console.log("Installed:", packageName);
        return Promise.resolve();
      }}
      onUninstall={(name) => {
        setPackages((prev) => prev.filter((p) => p.name !== name));
      }}
      mutable={true}
      registryPackageList={registryPackageList}
    />
  );
}

function PackageManagerStoryWrapper(storyArgs: Partial<Props> = {}): Story {
  const defaultArgs = {
    ...baseArgs,
    ...storyArgs,
  } as Props;
  return {
    render: PackageManagerWrapper,
    args: defaultArgs,
  };
}

export const Default: Story = PackageManagerStoryWrapper();

export const WithLoading: Story = PackageManagerStoryWrapper({
  onInstall: () => new Promise((resolve) => setTimeout(() => resolve(), 1000)),
});

export const WithError: Story = PackageManagerStoryWrapper({
  onInstall: (name) =>
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Package "${name}" was not found`)),
        1000,
      ),
    ),
});

export const Immutable: Story = PackageManagerStoryWrapper({ mutable: false });

export const WithManyPackages: Story = {
  ...PackageManagerStoryWrapper(),
  decorators: [
    (Story) => (
      <div className="h-[600px]">
        <Story />
      </div>
    ),
  ],
};

export const MixedStatuses: Story = {
  ...PackageManagerStoryWrapper({ registryPackageList: mixedStatusPackages }),
  decorators: [
    (Story) => (
      <div className="h-[700px]">
        <Story />
      </div>
    ),
  ],
};

export const OnlyAvailable: Story = PackageManagerStoryWrapper({
  registryPackageList: onlyAvailablePackages,
});

export const OnlyLocallyInstalled: Story = PackageManagerStoryWrapper({
  registryPackageList: onlyLocallyInstalledPackages,
});

export const Empty: Story = PackageManagerStoryWrapper({
  registryPackageList: [],
});
