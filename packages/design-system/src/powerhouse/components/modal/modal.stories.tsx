import { useArgs } from "@storybook/preview-api";
import type { Meta, StoryObj } from "@storybook/react";
import { Modal } from "./index.js";

const meta = {
  title: "Powerhouse/Components/Modal",
  component: Modal,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof Modal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();

    return (
      <div className="bg-white">
        <Modal
          {...args}
          onOpenChange={(open) => {
            setArgs({ ...args, open });
          }}
          open={args.open}
        >
          <div>
            lorem ipsum dolor sit amet consectetur adipisicing elit. Quisquam
            quod, voluptatum, quae voluptatem voluptas lorem ipsum dolor sit
            amet consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptas lorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptaslorem ipsum dolor sit amet consectetur adipisicing elit.
            Quisquam quod, voluptatum, quae voluptatem voluptaslorem ipsum dolor
            sit amet consectetur adipisicing elit. Quisquam quod, voluptatum,
            quae voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptaslorem ipsum dolor sit amet consectetur adipisicing elit.
            Quisquam quod, voluptatum, quae voluptatem voluptaslorem ipsum dolor
            sit amet consectetur adipisicing elit. Quisquam quod, voluptatum,
            quae voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptasloremquae voluptatem voluptaslorem ipsum dolor sit amet
            consectetur adipisicing elit. Quisquam quod, voluptatum, quae
            voluptatem voluptaslorem ipsum dolor sit amet consectetur
            adipisicing elit. Quisquam quod, voluptatum, quae voluptatem
            voluptaslorem
          </div>
        </Modal>
        <button
          onClick={() => {
            setArgs({ ...args, open: true });
          }}
        >
          Open modal
        </button>
      </div>
    );
  },
};
