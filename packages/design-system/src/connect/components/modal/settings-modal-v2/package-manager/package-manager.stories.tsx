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

// Packages with dist-tag + version metadata so the `name@tag` search path
// has something meaningful to resolve against.
const taggedPackages: RegistryPackage[] = [
  {
    ...mockPackages[0],
    status: "available",
    version: "2.4.1",
    distTags: { latest: "2.4.1", staging: "2.5.0-staging.1" },
    versions: ["1.0.0", "2.0.0", "2.4.1", "2.5.0-staging.1"],
  },
  {
    ...mockPackages[1],
    status: "available",
    version: "1.2.3",
    distTags: { latest: "1.2.3" },
    versions: ["1.0.0", "1.2.3"],
  },
  {
    ...mockPackages[2],
    status: "available",
    version: "0.9.0",
    distTags: { latest: "0.9.0", dev: "1.0.0-dev.4" },
    versions: ["0.5.0", "0.9.0", "1.0.0-dev.4"],
  },
  {
    ...mockPackages[3],
    status: "available",
    version: "3.0.0",
    distTags: {
      latest: "3.0.0",
      dev: "3.1.0-dev.2",
      staging: "3.1.0-staging.1",
    },
    versions: ["2.0.0", "3.0.0", "3.1.0-dev.2", "3.1.0-staging.1"],
  },
  {
    ...mockPackages[4],
    status: "available",
    version: "0.1.0",
    // No dist-tags — covers the "package without metadata" path.
  },
];

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

export function PackageManagerWrapper(args: Partial<Props> = {}) {
  const initial =
    args.registryPackageList ?? baseArgs.registryPackageList ?? [];
  const [registryPackageList, setPackages] = useState(initial);
  return (
    <PackageManager
      {...args}
      onInstall={
        args.onInstall ??
        ((packageName) => {
          console.log("Installed:", packageName);
          return Promise.resolve();
        })
      }
      onUninstall={
        args.onUninstall ??
        ((name) => {
          setPackages((prev) => prev.filter((p) => p.name !== name));
        })
      }
      mutable={args.mutable ?? true}
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
    render: (args) => <PackageManagerWrapper {...args} />,
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

/**
 * Available packages carrying dist-tags + version metadata. The search
 * input is the only way to narrow results — try `@uniswap/lp-tools@staging`
 * or `my-pkg@1.2.3` to target a specific tag or version.
 */
export const WithTaggedPackages: Story = {
  ...PackageManagerStoryWrapper({
    registryPackageList: taggedPackages,
  }),
  decorators: [
    (Story) => (
      <div className="h-[700px]">
        <Story />
      </div>
    ),
  ],
};

/**
 * The search input always shows an "Install from npm" fallback card when
 * the typed query is a plausible package name that doesn't match anything
 * already listed in the custom registry. Covers the case where the user
 * wants to pull an npm-only package through the registry's uplink.
 *
 * Try typing `react-markdown` or `lodash` — the fallback card appears at
 * the bottom of the results (the mock list doesn't contain those names).
 */
export const WithNpmFallback: Story = {
  ...PackageManagerStoryWrapper({
    registryPackageList: taggedPackages,
  }),
  decorators: [
    (Story) => (
      <div className="h-[500px]">
        <Story />
      </div>
    ),
  ],
};
