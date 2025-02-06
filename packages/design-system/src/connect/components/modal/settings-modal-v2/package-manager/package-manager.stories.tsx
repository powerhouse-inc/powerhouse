import type { Meta, StoryObj } from "@storybook/react";

import { useState } from "react";
import { PackageManager, PackageManagerProps } from "./package-manager";

const meta: Meta<typeof PackageManager> = {
  title: "Connect/Components/PackageManager",
  component: PackageManager,
  excludeStories: ["PackageManagerWrapper"],
};

export default meta;
type Story = StoryObj<typeof meta>;

const reactorOptions = [
  {
    label: "Local Reactor",
    value: "local-reactor",
  },
  {
    label: "Switchboard",
    value: "switchboard",
  },
];

const packages = [
  {
    id: "@sky-ph/rwa",
    name: "RWA Reporting Package",
    description:
      "The real world assets portfolio reporting package for the sky ecosystem.",
    category: "Finance",
    publisher: "@powerhousedao",
    publisherUrl: "https://www.powerhouse.inc/",
    modules: [
      "Analytics Processor (Switchboard)",
      "RWA Portfolio Report Document Model (Connect)",
      "RWA Portfolio Report Editor (Connect)",
    ],
  },
  {
    id: "@powerhousedao/builder-tooling",
    name: "Builder Tooling",
    description:
      "The real world assets portfolio reporting package for the sky ecosystem.",
    category: "Finance",
    publisher: "@powerhousedao",
    publisherUrl: "https://www.powerhouse.inc/",
    modules: [
      "Analytics Processor (Switchboard)",
      "RWA Portfolio Report Document Model (Connect)",
      "RWA Portfolio Report Editor (Connect)",
    ],
  },
];

export function PackageManagerWrapper(
  args: PackageManagerProps = {
    reactor: "local-reactor",
    options: reactorOptions,
    packages,
  } as unknown as PackageManagerProps,
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

function PackageManagerStoryWrapper(
  storyArgs: Partial<PackageManagerProps> = {},
): Story {
  const defaultArgs = {
    reactor: "local-reactor",
    options: reactorOptions,
    packages,
    ...storyArgs,
  } as PackageManagerProps;
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
