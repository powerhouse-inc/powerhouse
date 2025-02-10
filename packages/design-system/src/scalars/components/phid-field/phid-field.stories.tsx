import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { Command } from "@/scalars/components/fragments/command";
import { cn } from "@/scalars/lib/utils";
import { PHIDField } from "./phid-field";
import { PHIDInputContainer } from "./phid-input-container";
import { PHIDList } from "./phid-list";
import { PHIDListItem } from "./phid-list-item";
import { mockedOptions, fetchOptions, fetchSelectedOption } from "./utils";
import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
} from "@/scalars/lib/storybook-arg-types";

const meta: Meta<typeof PHIDField> = {
  title: "Document Engineering/Simple Components/PHID Field",
  component: PHIDField,
  decorators: [
    withForm,
    (Story) => (
      <div style={{ maxWidth: "280px", margin: "1rem auto 0" }}>
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...PrebuiltArgTypes.placeholder,
    ...PrebuiltArgTypes.maxLength,

    defaultBranch: {
      control: "text",
      description: "Specifies the default branch to use when none is provided.",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "main" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    defaultScope: {
      control: "text",
      description: "Specifies the default scope to use when none is provided.",
      table: {
        type: { summary: "string" },
        defaultValue: { summary: "public" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowedScopes: {
      control: "object",
      description: "List of allowed scopes.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowedDocumentTypes: {
      control: "object",
      description: "Defines which document types can be referenced.",
      table: {
        type: { summary: "string[]" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    allowUris: {
      control: "boolean",
      description: "Enables URI format as valid input in the field",
      table: {
        type: { summary: "boolean" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    autoComplete: {
      control: "boolean",
      description:
        "Enables autocomplete functionality to suggest PHIDs while typing",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "true" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    fetchOptionsCallback: {
      control: false,
      description: "Function to fetch PHID options based on user input",
      table: {
        type: { summary: "(phidFragment: string) => Promise<PHIDItem[]>" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "autoComplete", neq: false },
    },

    fetchSelectedOptionCallback: {
      control: false,
      description: "Function to fetch details for a selected PHID",
      table: {
        type: { summary: "(phid: string) => Promise<PHIDItem | undefined>" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "autoComplete", neq: false },
    },

    allowDataObjectReference: {
      control: "boolean",
      description: "Allows direct referencing of data objects in the field",
      table: {
        type: { summary: "boolean" },
        defaultValue: { summary: "false" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    variant: {
      control: "radio",
      options: ["withId", "withIdAndTitle", "withIdTitleAndDescription"],
      description:
        "Controls the amount of information displayed for each PHID: ID only, ID with title, or ID with title and description",
      table: {
        type: {
          summary: '"withId" | "withIdAndTitle" | "withIdTitleAndDescription"',
        },
        defaultValue: { summary: "withId" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
      if: { arg: "autoComplete", neq: false },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "phid-field",
  },
} satisfies Meta<typeof PHIDField>;

export default meta;

type Story = StoryObj<typeof PHIDField>;

export const Default: Story = {
  args: {
    label: "PHID field",
    placeholder: "phd:",
    fetchOptionsCallback: fetchOptions,
    fetchSelectedOptionCallback: fetchSelectedOption,
  },
};

export const PopoverOpenWithResults: Story = {
  args: {
    variant: "withIdTitleAndDescription",
  },
  render: function Wrapper(args) {
    return (
      <Command shouldFilter={false}>
        <div
          className={cn(
            "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",
            "rounded-md shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
          )}
        >
          <input type="text" className="sr-only" autoFocus />
          <PHIDList variant={args.variant} options={mockedOptions} />
        </div>
      </Command>
    );
  },
};

export const PopoverOpenWithNoResults: Story = {
  args: {
    variant: "withIdTitleAndDescription",
  },
  render: function Wrapper(args) {
    return (
      <Command shouldFilter={false}>
        <div
          className={cn(
            "border-gray-300 bg-white dark:border-slate-500 dark:bg-slate-600",
            "rounded-md shadow-[1px_4px_15px_0px_rgba(74,88,115,0.25)] dark:shadow-[1px_4px_15.3px_0px_#141921]",
          )}
        >
          <PHIDList variant={args.variant} options={[]} />
        </div>
      </Command>
    );
  },
};

export const Filled: Story = {
  args: {
    variant: "withIdTitleAndDescription",
  },
  render: function Wrapper(args) {
    const asCard =
      args.variant === "withIdAndTitle" ||
      args.variant === "withIdTitleAndDescription";
    return (
      <Command
        shouldFilter={false}
        className={cn("dark:bg-charcoal-900 rounded-md bg-gray-100")}
      >
        <PHIDInputContainer
          id="phid-field"
          name="phid-field"
          value={mockedOptions[0].phid}
          isLoading={false}
          haveFetchError={false}
          selectedOption={mockedOptions[0]}
          placeholder="phd:"
          hasError={false}
          label="PHID field"
          isPopoverOpen={false}
        />
        {asCard && (
          <PHIDListItem
            variant={args.variant}
            title={mockedOptions[0].title}
            path={mockedOptions[0].path}
            phid={mockedOptions[0].phid}
            description={mockedOptions[0].description}
            asPlaceholder={false}
            showPHID={false}
            className={cn("rounded-t-none pt-2")}
          />
        )}
      </Command>
    );
  },
};
