import type { Meta, StoryObj } from "@storybook/react";
import type { RegistryPackage } from "@powerhousedao/shared/registry";
import { useState } from "react";
import {
  EMPTY_FILTERS,
  PackageManagerFilters,
  type PackageManagerFilterState,
} from "./package-manager-filters.js";

const samplePackages: RegistryPackage[] = [
  {
    name: "@powerhousedao/builder-profile",
    path: "/stub",
    status: "available",
    manifest: null,
    documentTypes: [],
    version: "1.1.0-dev.29",
    distTags: {
      latest: "1.0.8",
      staging: "1.0.0-staging.5",
      dev: "1.1.0-dev.29",
    },
    versions: ["1.0.0", "1.0.8", "1.1.0-dev.29"],
  },
  {
    name: "@powerhousedao/reporting",
    path: "/stub",
    status: "available",
    manifest: null,
    documentTypes: [],
    version: "2.3.0",
    distTags: { latest: "2.3.0", staging: "2.4.0-staging.1" },
    versions: ["2.0.0", "2.3.0", "2.4.0-staging.1"],
  },
  {
    name: "@vendor/no-tags",
    path: "/stub",
    status: "available",
    manifest: null,
    documentTypes: [],
    version: "0.5.0",
  },
];

const meta: Meta<typeof PackageManagerFilters> = {
  title: "Connect/Components/PackageManager/Filters",
  component: PackageManagerFilters,
};
export default meta;
type Story = StoryObj<typeof meta>;

function Wrapper({
  initial,
  packages,
}: {
  initial: PackageManagerFilterState;
  packages: RegistryPackage[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className="w-[520px]">
      <PackageManagerFilters
        registryPackageList={packages}
        value={value}
        onChange={setValue}
      />
      <pre className="mt-3 rounded bg-gray-100 p-2 text-xs text-gray-700">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export const Default: Story = {
  render: () => <Wrapper initial={EMPTY_FILTERS} packages={samplePackages} />,
};

export const PreselectedDevTag: Story = {
  render: () => (
    <Wrapper
      initial={{ ...EMPTY_FILTERS, tag: "dev" }}
      packages={samplePackages}
    />
  ),
};

export const VersionRangePreset: Story = {
  render: () => (
    <Wrapper
      initial={{ tag: null, minVersion: "1.0.0", maxVersion: "2.0.0" }}
      packages={samplePackages}
    />
  ),
};

export const NoTagsReported: Story = {
  render: () => (
    <Wrapper initial={EMPTY_FILTERS} packages={[{ ...samplePackages[2] }]} />
  ),
};

// Confirms the tag chip row is derived from the input packages — not a
// hard-coded list. Here the packages only declare `latest` and `dev`, so
// the row should show exactly those two chips (no `staging`).
const latestAndDevOnlyPackages: RegistryPackage[] = [
  {
    name: "@vendor/pkg-a",
    path: "/stub",
    status: "available",
    manifest: null,
    documentTypes: [],
    version: "1.2.3",
    distTags: { latest: "1.2.3", dev: "1.3.0-dev.2" },
  },
  {
    name: "@vendor/pkg-b",
    path: "/stub",
    status: "available",
    manifest: null,
    documentTypes: [],
    version: "0.5.0",
    distTags: { latest: "0.5.0" },
  },
];

export const DerivedTagsLatestAndDev: Story = {
  render: () => (
    <Wrapper initial={EMPTY_FILTERS} packages={latestAndDevOnlyPackages} />
  ),
};

// One package, one dist-tag — the row shrinks to a single chip (plus "Any").
export const DerivedTagsLatestOnly: Story = {
  render: () => (
    <Wrapper initial={EMPTY_FILTERS} packages={[latestAndDevOnlyPackages[1]]} />
  ),
};
