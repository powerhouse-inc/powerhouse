import type { Meta, StoryObj } from "@storybook/react";

import type { ComponentPropsWithoutRef } from "react";
import { useState } from "react";
import {
  mockAvailablePackages,
  mockPackages,
  mockRegistryOptions,
} from "../mocks.js";
import { PackageManager } from "./package-manager.js";
import type { RegistryPackageInfo } from "./types.js";

const meta: Meta<typeof PackageManager> = {
  title: "Connect/Components/PackageManager",
  component: PackageManager,
  excludeStories: ["PackageManagerWrapper"],
};

export default meta;
type Story = StoryObj<typeof meta>;

type Props = ComponentPropsWithoutRef<typeof PackageManager>;

const baseArgs: Partial<Props> = {
  registries: mockRegistryOptions,
  selectedRegistryId: "production",
  registryStatus: "connected",
  packages: mockPackages,
  availablePackages: mockAvailablePackages,
  mutable: true,
};

const mockFetchPackages = (query: string): Promise<RegistryPackageInfo[]> =>
  new Promise((resolve) => {
    setTimeout(() => {
      resolve(
        [
          {
            name: "@sky-ph/atlas-scope-framework",
            description: "Atlas Scope Framework package",
            publisher: "@sky-ph",
          },
          {
            name: "@sky-ph/atlas-foundation",
            description: "Atlas Foundation document models",
            publisher: "@sky-ph",
          },
        ].filter(
          (p) =>
            p.name.toLowerCase().includes(query.toLowerCase()) ||
            p.description.toLowerCase().includes(query.toLowerCase()),
        ),
      );
    }, 500);
  });

export function PackageManagerWrapper(
  args: Pick<Props, "selectedRegistryId" | "onRegistryChange">,
) {
  const selectedRegistryIdArg =
    args.selectedRegistryId ?? baseArgs.selectedRegistryId ?? "production";
  const onRegistryChangeArg = args.onRegistryChange;
  const [registryId, setRegistryId] = useState(selectedRegistryIdArg);
  const [packages, setPackages] = useState(baseArgs.packages ?? []);
  return (
    <PackageManager
      registries={mockRegistryOptions}
      registryStatus="connected"
      selectedRegistryId={registryId}
      onRegistryChange={(value) =>
        (onRegistryChangeArg ?? setRegistryId)(value)
      }
      onInstall={(name) => {
        console.log("Installed:", name);
      }}
      onUninstall={(name) => {
        setPackages((prev) => prev.filter((p) => p.id !== name));
      }}
      fetchPackages={mockFetchPackages}
      mutable={true}
      availablePackages={mockAvailablePackages}
      packages={packages}
    />
  );
}

function PackageManagerStoryWrapper(storyArgs: Partial<Props> = {}): Story {
  const defaultArgs = {
    ...baseArgs,
    ...storyArgs,
  } as Props;
  return {
    // @ts-expect-error - storybook doesn't support the type
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

export const WithCustomRegistry: Story = PackageManagerStoryWrapper({
  selectedRegistryId: "custom",
  customRegistryUrl: "https://my-registry.example.com/-/cdn/",
});

export const Connecting: Story = PackageManagerStoryWrapper({
  registryStatus: "connecting",
});

export const RegistryError: Story = PackageManagerStoryWrapper({
  registryStatus: "error",
});

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
