import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import { Disclosure } from "./index.js";

const meta = {
  title: "Connect/Components/Disclosure",
  component: Disclosure,
} satisfies Meta<typeof Disclosure>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Disclosure",
    children: (
      <p>lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam</p>
    ),
    isOpen: false,
    onOpenChange: () => {},
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();

    return (
      <div className="w-[408px] bg-white p-6">
        <Disclosure
          {...args}
          onOpenChange={() => setArgs({ ...args, isOpen: !args.isOpen })}
        />
      </div>
    );
  },
};
