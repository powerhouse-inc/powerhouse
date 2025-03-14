import type { Meta, StoryObj } from "@storybook/react";

import { type ComponentPropsWithoutRef, useState } from "react";
import { mockPackages, mockReactorOptions } from "../mocks.js";
import { PackageManager } from "./package-manager.js";

const meta: Meta<typeof PackageManager> = {
  title: "Connect/Components/PackageManager",
  component: PackageManager,
  excludeStories: ["PackageManagerWrapper"],
};

export default meta;
type Story = StoryObj<typeof meta>;

type Props = ComponentPropsWithoutRef<typeof PackageManager>;

const baseArgs = {
  reactor: "local-reactor",
  reactorOptions: mockReactorOptions,
  packages: mockPackages,
  mutable: true,
};
export function PackageManagerWrapper(
  args: Pick<Props, "reactor" | "onReactorChange">,
) {
  const finalArgs = { ...baseArgs, ...args };
  const { reactor, onReactorChange, ...rest } = finalArgs;
  const [value, setValue] = useState(reactor ?? "");
  const [packages, setPackages] = useState(finalArgs.packages);
  return (
    <PackageManager
      reactor={value}
      onReactorChange={(value) => (onReactorChange ?? setValue)(value ?? "")}
      onInstall={() => {}}
      onUninstall={(name) => {
        setPackages((prev) => prev.filter((p) => p.id !== name));
      }}
      {...rest}
      packages={packages}
    />
  );
}

function PackageManagerStoryWrapper(storyArgs: Partial<Props> = {}): Story {
  const defaultArgs = {
    reactor: "local-reactor",
    options: mockReactorOptions,
    packages: mockPackages,
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
