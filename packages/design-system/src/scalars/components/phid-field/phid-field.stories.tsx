import type { Meta, StoryObj } from "@storybook/react";
import { withForm } from "@/scalars/lib/decorators";
import { Command } from "@/scalars/components/fragments/command";
import { cn } from "@/scalars/lib/utils";
import { PHIDField } from "./phid-field";
import { PHIDInputContainer } from "./phid-input-container";
import { PHIDList } from "./phid-list";
import { PHIDListItem } from "./phid-list-item";
import { mockedOptions } from "./utils";
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
          <input type="text" className="sr-only" aria-hidden="true" autoFocus />
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
        className={cn(
          asCard && [
            "group rounded-md",
            "dark:focus-within:ring-charcoal-300 focus-within:ring-1 focus-within:ring-gray-900 focus-within:ring-offset-0",
          ],
        )}
      >
        <PHIDInputContainer
          id="phid-field"
          name="phid-field"
          value={mockedOptions[0].phid}
          asCard={asCard}
          isLoading={false}
          haveFetchError={false}
          options={[]}
          selectedOption={mockedOptions[0]}
          handleOpenChange={() => {}}
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
            className={cn(
              "rounded-t-none border border-gray-300 border-t-transparent bg-gray-100 pt-2",
              "dark:border-charcoal-700 dark:border-t-transparent dark:bg-slate-600",
              "dark:group-focus-within:border-t-charcoal-700 group-focus-within:border-t-gray-300",
            )}
          />
        )}
      </Command>
    );
  },
};
