import type { Meta, StoryObj } from "@storybook/react";

import { ComponentPropsWithoutRef, useState } from "react";
import { mockPackages, mockReactorOptions } from "../mocks";
import { PackageManager } from "./package-manager";

const meta: Meta<typeof PackageManager> = {
  title: "Connect/Components/PackageManager",
  component: PackageManager,
  excludeStories: ["PackageManagerWrapper"],
};

export default meta;
type Story = StoryObj<typeof meta>;

type Props = ComponentPropsWithoutRef<typeof PackageManager>;

export function PackageManagerWrapper(
  args: Props = {
    reactor: "local-reactor",
    options: mockReactorOptions,
    packages: mockPackages,
  } as unknown as Props,
) {
  const { reactor, onReactorChange, ...rest } = args;
  const [value, setValue] = useState(reactor ?? "");
  return (
    <PackageManager
      reactor={value}
      onReactorChange={(value) => (onReactorChange ?? setValue)(value ?? "")}
      {...rest}
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
