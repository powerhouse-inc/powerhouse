import type { Meta, StoryObj } from "@storybook/react";
import { Icon } from "./icon.js";
import { iconNames } from "../icon-components/index.js";
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
      <div className="bg-gray-50 p-8 dark:bg-slate-800">
        <h2 className="mb-6 text-xl font-semibold">All Available Icons</h2>
        <div className="flex flex-wrap">
          {iconNames.map((name) => (
            <div
              key={name}
              className="flex flex-col items-center gap-2 rounded-lg border border-gray-300 p-4 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100"
            >
              <div className="flex size-10 items-center justify-center">
                <Icon
                  name={name}
                  className="text-gray-700 dark:text-slate-200"
                />
              </div>
              <span className="text-xs text-gray-700 dark:text-slate-200">
                {name}
              </span>
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
