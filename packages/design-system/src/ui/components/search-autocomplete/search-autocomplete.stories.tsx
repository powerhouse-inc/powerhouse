import type { Meta, StoryObj } from "@storybook/react";
import { SearchAutocomplete } from "./search-autocomplete.js";
import type { SearchAutocompleteOption } from "./types.js";

const SAMPLE_PACKAGES: SearchAutocompleteOption[] = [
  {
    value: "@powerhousedao/versioned-documents",
    label: "@powerhousedao/versioned-documents",
    version: "5.1.0-dev.26",
    description: "Versioned documents test package",
    meta: "@powerhousedao",
  },
  {
    value: "@powerhousedao/common",
    label: "@powerhousedao/common",
    version: "6.0.0-dev.176",
    description: "Common reusable building blocks for Powerhouse projects",
    meta: "@powerhousedao",
  },
  {
    value: "@powerhousedao/design-system",
    label: "@powerhousedao/design-system",
    version: "6.0.0-dev.176",
    description: "Powerhouse design system components",
    meta: "@powerhousedao",
    disabled: true,
    disabledLabel: "Installed",
  },
  {
    value: "no-version-package",
    label: "no-version-package",
    description: "A package without a version field",
    meta: "@example",
  },
];

const meta: Meta<typeof SearchAutocomplete> = {
  title: "UI/SearchAutocomplete",
  component: SearchAutocomplete,
  parameters: {
    chromatic: {
      disableSnapshot: true,
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const PackageSearch: Story = {
  args: {
    placeholder: "Search packages...",
    selectLabel: "Install",
    fetchOptions: (query: string) =>
      Promise.resolve(
        SAMPLE_PACKAGES.filter(
          (pkg) =>
            pkg.label.toLowerCase().includes(query.toLowerCase()) ||
            pkg.description?.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    onSelect: (value: string) => {
      console.log("selected:", value);
    },
  },
  render: (args) => (
    <div className="w-[480px] p-6">
      <SearchAutocomplete {...args} />
      <p className="mt-3 text-xs text-gray-500">
        Try typing &quot;p&quot; or &quot;design&quot; to see the results.
      </p>
    </div>
  ),
};

export const NoFetchOptions: Story = {
  args: {
    placeholder: "Type a value and press Enter...",
    selectLabel: "Submit",
    onSelect: (value: string) => {
      console.log("submitted:", value);
    },
  },
  render: (args) => (
    <div className="w-[480px] p-6">
      <SearchAutocomplete {...args} />
    </div>
  ),
};
