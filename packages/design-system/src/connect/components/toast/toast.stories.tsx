import type { Meta, StoryObj } from "@storybook/react";
import type { ConnectToastOptions } from "./toast.js";
import { ToastContainer, toast } from "./toast.js";

const meta: Meta<ConnectToastOptions & { content: React.ReactNode }> = {
  title: "Connect/Components/Toast",
  component: ToastContainer,
  decorators: [
    (Story) => (
      <>
        <ToastContainer />
        <div className="flex h-[300px] items-center justify-center">
          <Story />
        </div>
      </>
    ),
  ],
  argTypes: {
    content: { control: { type: "text" } },
    autoClose: { control: { type: "number" } },
    type: {
      control: { type: "select" },
      options: [
        "default",
        "info",
        "success",
        "warning",
        "error",
        "connect-success",
        "connect-warning",
        "connect-loading",
        "connect-deleted",
      ],
    },
    position: {
      control: { type: "select" },
      options: [
        "top-left",
        "top-center",
        "top-right",
        "bottom-left",
        "bottom-center",
        "bottom-right",
      ],
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    type: "connect-success",
    content: "Hello World! 🤖",
    autoClose: 5000,
    // hideProgressBar: true,
  },
  render: (args) => {
    const { content, ...options } = args;
    return (
      <button
        className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:hover-effect active:active-effect"
        onClick={() =>
          toast(
            content,
            // @ts-expect-error - storybook doesn't support the type
            options,
          )
        }
      >
        Trigger Toast
      </button>
    );
  },
};
