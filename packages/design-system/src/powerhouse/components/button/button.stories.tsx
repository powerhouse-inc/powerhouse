import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "../index.js";
import { PowerhouseButton } from "./index.js";

const meta = {
  title: "Powerhouse/Components/Button",
  component: PowerhouseButton,
} satisfies Meta<typeof PowerhouseButton>;

export default meta;

type Story = StoryObj<typeof meta>;

const Template: Story = {
  args: {
    children: "Button",
  },
  decorators: [
    (Story) => (
      <div className="grid h-screen place-items-center bg-white">
        <Story />
      </div>
    ),
  ],
};

export const Default: Story = {
  ...Template,
};

export const DefaultHover: Story = {
  ...Default,
  parameters: {
    pseudo: {
      hover: true,
    },
  },
};

export const DefaultActive: Story = {
  ...Default,
  parameters: {
    pseudo: {
      active: true,
    },
  },
};

export const DefaultDisabled: Story = {
  ...Default,
  args: {
    ...Default.args,
    disabled: true,
  },
};

export const Light: Story = {
  ...Template,
  args: {
    ...Template.args,
    color: "light",
  },
};

export const LightHover: Story = {
  ...Light,
  parameters: {
    pseudo: {
      hover: true,
    },
  },
};

export const LightActive: Story = {
  ...Light,
  parameters: {
    pseudo: {
      active: true,
    },
  },
};

export const LightDisabled: Story = {
  ...Light,
  args: {
    ...Light.args,
    disabled: true,
  },
};

export const Red: Story = {
  ...Template,
  args: {
    ...Template.args,
    color: "red",
  },
};

export const RedHover: Story = {
  ...Red,
  parameters: {
    pseudo: {
      hover: true,
    },
  },
};

export const RedActive: Story = {
  ...Red,
  parameters: {
    pseudo: {
      active: true,
    },
  },
};

export const RedDisabled: Story = {
  ...Red,
  args: {
    ...Red.args,
    disabled: true,
  },
};

export const Blue: Story = {
  ...Template,
  args: {
    ...Template.args,
    color: "blue",
  },
};

export const BlueHover: Story = {
  ...Blue,
  parameters: {
    pseudo: {
      hover: true,
    },
  },
};

export const BlueActive: Story = {
  ...Blue,
  parameters: {
    pseudo: {
      active: true,
    },
  },
};

export const BlueDisabled: Story = {
  ...Blue,
  args: {
    ...Blue.args,
    disabled: true,
  },
};

export const Small: Story = {
  ...Template,
  args: {
    ...Template.args,
    size: "small",
  },
};

export const WithIcon: Story = {
  ...Template,
  args: {
    ...Template.args,
    icon: <Icon name="Plus" size={20} />,
  },
};

export const SmallWithIcon: Story = {
  ...Small,
  args: {
    ...Small.args,
    icon: <Icon name="Plus" size={16} />,
  },
};
