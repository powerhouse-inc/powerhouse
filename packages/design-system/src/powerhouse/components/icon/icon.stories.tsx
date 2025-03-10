import { type Meta, type StoryObj } from "@storybook/react";
import { Icon, iconNames } from "./icon";

const meta = {
  title: "Powerhouse/Components/Icon",
  component: Icon,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof Icon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllIcons: Story = {
  args: {
    name: "Circle",
  },
  render: () => {
    return (
      <div className="bg-white p-8">
        <h2 className="mb-6 text-xl font-semibold">All Available Icons</h2>
        <div className="flex flex-wrap">
          {iconNames.map((name) => (
            <div
              key={name}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 p-4"
            >
              <div className="flex size-10 items-center justify-center">
                <Icon name={name} className="text-gray-700" />
              </div>
              <span className="text-xs text-gray-600">{name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  },
};

export const CustomColor: Story = {
  args: {
    name: "Circle",
    color: "blue",
  },
};

export const CustomSize: Story = {
  args: {
    name: "Circle",
    size: 48,
  },
};

export const SingleIcon: Story = {
  args: {
    name: "Circle",
  },
};
