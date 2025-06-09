import { useArgs } from "@storybook/preview-api";
import { type Meta, type StoryObj } from "@storybook/react";
import { useCallback } from "react";
import { DangerZone } from "./danger-zone.js";

const meta = {
  title: "Connect/Components/SettingsModalV2/Danger Zone",
  component: DangerZone,
} satisfies Meta<typeof DangerZone>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    drives: [
      // @ts-expect-error mock
      {
        id: "cloud-drive",
        name: "Cloud Drive",
        slug: "cloud-drive",
        revision: {
          global: 1,
          local: 1,
        },
        documentType: "document-type",
        created: "2021-01-01",
        lastModified: "2021-01-01",
        state: {
          global: {
            icon: null,
            name: "Cloud Drive",
            nodes: [],
          },
          local: {
            sharingType: "CLOUD",
            availableOffline: true,
            listeners: [],
            triggers: [],
          },
        },
      },
    ],
    onDeleteDrive: () => {},
    onClearStorage: () => {},
  },
  render: function Wrapper(args) {
    const [, setArgs] = useArgs<typeof args>();
    const onClearStorage = useCallback(() => {
      alert("You cleared the storage. Good for you.");
    }, []);
    const onDeleteDrive = useCallback(
      (driveId: string) => {
        setArgs({
          drives: args.drives.filter((d) => d.id !== driveId),
        });
      },
      [args.drives, setArgs],
    );
    return (
      <DangerZone
        {...args}
        onClearStorage={onClearStorage}
        onDeleteDrive={onDeleteDrive}
      />
    );
  },
};
