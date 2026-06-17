import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";
import type { VersionSelection } from "./version-picker.js";
import {
  VersionPicker,
  resolveDefaultVersionSelection,
} from "./version-picker.js";

const meta: Meta<typeof VersionPicker> = {
  title: "Connect/Components/PackageManager/VersionPicker",
  component: VersionPicker,
};

export default meta;
type Story = StoryObj<typeof meta>;

type Args = {
  distTags?: Record<string, string>;
  versions?: string[];
  version?: string;
  preferredTag?: string;
  disabled?: boolean;
};

function Wrapper(args: Args) {
  const [selected, setSelected] = useState<VersionSelection>(() =>
    resolveDefaultVersionSelection({
      distTags: args.distTags,
      versions: args.versions,
      version: args.version,
      preferredTag: args.preferredTag,
    }),
  );
  return (
    <div className="flex min-h-[300px] items-start justify-start p-6">
      <div className="w-72 rounded-md border border-border bg-background p-4">
        <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Current selection
        </p>
        <p className="mb-3 font-mono text-xs text-foreground">
          {selected.kind}: {selected.value}
        </p>
        <VersionPicker
          distTags={args.distTags}
          versions={args.versions}
          selected={selected}
          onChange={setSelected}
          disabled={args.disabled}
        />
      </div>
    </div>
  );
}

/**
 * A package with `latest` and `dev` dist-tags plus several published versions.
 * The trigger defaults to `latest`. Opening the picker reveals the Tags
 * section above a Versions section; the search input filters both.
 */
export const Default: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    distTags: {
      latest: "1.2.0",
      dev: "1.3.0-dev.5",
    },
    versions: [
      "1.0.0",
      "1.1.0",
      "1.2.0",
      "1.3.0-dev.1",
      "1.3.0-dev.2",
      "1.3.0-dev.3",
      "1.3.0-dev.4",
      "1.3.0-dev.5",
    ],
  },
};

/**
 * Multiple dist-tags (`latest`, `dev`, `staging`, `next`). Picking any tag
 * sets the selection to that tag; picking a version sets it to the bare
 * semver string.
 */
export const MultipleTags: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    distTags: {
      latest: "3.0.0",
      dev: "3.1.0-dev.2",
      staging: "3.1.0-staging.1",
      next: "3.1.0-rc.1",
    },
    versions: [
      "2.0.0",
      "2.5.0",
      "3.0.0",
      "3.1.0-dev.1",
      "3.1.0-dev.2",
      "3.1.0-staging.1",
      "3.1.0-rc.1",
    ],
  },
};

/**
 * No dist-tags, only raw versions. The picker hides the Tags section
 * entirely and lists every published version.
 */
export const VersionsOnly: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    versions: ["0.5.0", "0.9.0", "1.0.0-dev.4"],
  },
};

/**
 * Single dist-tag, no version list. The Versions section collapses away;
 * only the `latest` tag is pickable.
 */
export const TagOnly: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    distTags: { latest: "1.2.3" },
  },
};

/**
 * No metadata at all — e.g. the npm-fallback card. The trigger is disabled
 * and shows the fallback label only.
 */
export const NoMetadata: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    version: "latest",
  },
};

/**
 * Typing `pkg@dev` in the search input pre-selects the `dev` tag on the
 * card. This story simulates that by seeding `preferredTag` at mount.
 */
export const PreferredTag: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    preferredTag: "dev",
    distTags: {
      latest: "1.2.0",
      dev: "1.3.0-dev.5",
    },
    versions: ["1.0.0", "1.1.0", "1.2.0", "1.3.0-dev.4", "1.3.0-dev.5"],
  },
};

/**
 * Disabled state — shown when the package is already installed. Trigger
 * cannot be opened.
 */
export const Disabled: Story = {
  render: (args) => <Wrapper {...(args as Args)} />,
  args: {
    disabled: true,
    distTags: { latest: "1.2.0" },
    versions: ["1.0.0", "1.2.0"],
  },
};
