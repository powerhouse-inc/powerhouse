import { LOCAL } from "@powerhousedao/design-system";
import { useArgs } from "@storybook/preview-api";
import { type Meta, type StoryObj } from "@storybook/react";
import { AddRemoteDriveModal } from "./add-remote-drive-modal.js";

const meta = {
  title: "Connect/Components/Add Remote Drive Modal",
  component: AddRemoteDriveModal,
} satisfies Meta<typeof AddRemoteDriveModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    onSubmit() {},
    onOpenChange() {},
    sharingType: LOCAL,
    requestPublicDrive(url) {
      return Promise.resolve({
        id: "1",
        name: "Public Drive",
        url,
      });
    },
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();

    return (
      <div className="grid size-full place-items-center">
        <button
          className="rounded-lg bg-red-500 p-4 text-white"
          onClick={() => {
            setArgs({
              ...args,
              modalProps: {
                ...args.modalProps,
                open: true,
              },
            });
          }}
        >
          Open Modal
        </button>
        <AddRemoteDriveModal {...args} />
      </div>
    );
  },
};
