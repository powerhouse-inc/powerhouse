import {
  getDefaultArgTypes,
  getValidationArgTypes,
  PrebuiltArgTypes,
  StorybookControlCategory,
  withForm,
} from "#scalars";
import type { Meta, StoryObj } from "@storybook/react";
import { UrlField } from "./url-field.js";

const meta: Meta<typeof UrlField> = {
  title: "Document Engineering/Simple Components/Url Field",
  component: UrlField,
  decorators: [withForm],
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    ...getDefaultArgTypes(),
    ...PrebuiltArgTypes.placeholder,

    allowedProtocols: {
      control: "object",
      description: "Allowed protocols for the URL",
      table: {
        type: { summary: "Array<string>" },
        defaultValue: { summary: "['http', 'https']" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    maxURLLength: {
      control: "number",
      description: "Maximum length of the URL",
      table: {
        type: { summary: "number" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },
    platformIcons: {
      control: "object",
      description:
        "An object where the key is the hostname and the value is the icon name or a React element",
      table: {
        type: { summary: "Record<string, IconName | ReactElement>" },
        category: StorybookControlCategory.COMPONENT_SPECIFIC,
      },
    },

    ...getValidationArgTypes(),
  },
  args: {
    name: "url-field",
    allowedProtocols: ["https"],
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    label: "Website URL",
    placeholder: "https://example.com",
  },
};

export const WithDescription: Story = {
  args: {
    label: "Forum URL",
    description: "Enter the URL to your online forum",
    placeholder: "https://myforum.com",
  },
};

export const Required: Story = {
  args: {
    label: "LinkedIn",
    required: true,
    placeholder: "https://linkedin.com/in/username",
  },
};

export const WithValue: Story = {
  args: {
    label: "With Value",
    value: "https://exaomple.com",
  },
};

export const Disabled: Story = {
  args: {
    label: "Read Only URL",
    value: "https://example.com",
    disabled: true,
  },
};

export const WithError: Story = {
  args: {
    label: "Website URL",
    value: "not-a-valid-url",
    errors: ["Please enter a valid URL"],
  },
};

export const WithWarning: Story = {
  args: {
    label: "Website URL",
    value: "https://example.com",
    warnings: ["URL may be unreachable"],
  },
};

export const WithPlatformIcon: Story = {
  args: {
    label: "Website URL",
    value: "https://github.com/test",
    platformIcons: {
      "github.com": "Github",
      "linkedin.com": "Linkedin",
      "twitter.com": "XTwitter",
      "x.com": "XTwitter",
      "youtube.com": "Youtube",
      "forum.sky.money": "Forum",
      "discord.com": "Discord",
      "discord.gg": "Discord",
    },
  },
};
