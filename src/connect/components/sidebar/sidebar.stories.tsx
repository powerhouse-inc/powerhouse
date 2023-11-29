import { ItemsContextProvider } from '@/connect/context/ItemsContext';
import { useItemActions } from '@/connect/hooks/tree-view/useItemActions';
import { generateMockDriveData } from '@/connect/utils/mocks/tree-item';
import { action } from '@storybook/addon-actions';
import { useArgs } from '@storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectSidebar, DriveView, DriveViewProps } from '..';

const drives = [
    ...generateMockDriveData({
        path: 'drive',
        label: 'MakerDAO Atlas',
        type: 'public-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'cloud',
        label: 'Powerhouse Team Drive',
        type: 'cloud-drive',
        expanded: false,
    }),
    ...generateMockDriveData({
        path: 'cloud-2',
        label: 'Powerhouse Team Drive 2',
        type: 'cloud-drive',
        expanded: true,
    }),
    ...generateMockDriveData({
        path: 'local',
        label: 'Local Device',
        type: 'local-drive',
        expanded: true,
    }),
];

const meta: Meta<typeof ConnectSidebar> = {
    title: 'Connect/Components',
    component: ConnectSidebar,
    decorators: [
        Story => (
            <ItemsContextProvider items={drives}>
                <div className="relative h-screen">
                    <Story />
                </div>
            </ItemsContextProvider>
        ),
    ],
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

const onItemOptionsClick = action('onItemOptionsClick');

const DriveViewImpl = (args: DriveViewProps) => {
    const { onItemClick, ...restArgs } = args;
    const actions = useItemActions();

    const onItemClickHandler: DriveViewProps['onItemClick'] = (e, item) => {
        actions.toggleExpandedAndSelect(item.id);
        onItemClick?.(e, item);
    };

    return <DriveView {...restArgs} onItemClick={onItemClickHandler} />;
};

export const Sidebar: Story = {
    decorators: [
        function Component(Story, ctx) {
            const [, setArgs] = useArgs<typeof ctx.args>();

            const onToggle = () => {
                ctx.args.onToggle();
                setArgs({ collapsed: !ctx.args.collapsed });
            };

            return <Story args={{ ...ctx.args, onToggle }} />;
        },
    ],
    args: {
        collapsed: false,
        username: 'Willow.eth',
        address: '0x8343...3u432u32',
        children: (
            <>
                <DriveViewImpl
                    type="public-drive"
                    name="Public Drives"
                    className="mx-2 mb-2"
                    onItemOptionsClick={onItemOptionsClick}
                />
                <DriveViewImpl
                    type="cloud-drive"
                    name="Secure Cloud Storage"
                    className="mx-2 mb-2"
                    onItemOptionsClick={onItemOptionsClick}
                />
                <DriveViewImpl
                    type="local-drive"
                    name="My Local Drives"
                    className="mx-2 mb-2"
                    onItemOptionsClick={onItemOptionsClick}
                />
            </>
        ),
    },
};
