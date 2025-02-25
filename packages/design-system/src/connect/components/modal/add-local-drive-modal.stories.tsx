import { useArgs } from "@storybook/preview-api";
import { Meta, StoryObj } from "@storybook/react";
import { AddLocalDriveModal } from "./add-local-drive-modal";

const meta = {
  title: "Connect/Components/Create Drive Modal",
  component: AddLocalDriveModal,
} satisfies Meta<typeof AddLocalDriveModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    onSubmit() {},
    onOpenChange() {},
    appOptions: [
      {
        id: "powerhouse/common",
        name: "Generic Drive Explorer",
        driveEditor: "GenericDriveExplorer",
      },
      {
        id: "powerhouse/invoice/contributor",
        name: "Contributor App",
        driveEditor: "ContributorDrive",
      },
      {
        id: "powerhouse/invoice/administrator",
        name: "OH Administrator App",
        driveEditor: "AdministratorDrive",
      },
    ],
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
              open: true,
            });
          }}
        >
          Open Modal
        </button>
        <AddLocalDriveModal
          {...args}
          modalProps={{
            ...args.modalProps,
            onOpenChange: (open) => {
              setArgs({
                ...args,
                open,
              });
            },
          }}
        />
      </div>
    );
  },
};
