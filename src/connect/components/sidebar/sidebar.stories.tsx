import { DriveView } from '@/powerhouse';
import { useArgs } from '@storybook/preview-api';
import type { Meta, StoryObj } from '@storybook/react';
import { ConnectSidebar } from '..';

const meta: Meta<typeof ConnectSidebar> = {
    title: 'Connect/Components',
    component: ConnectSidebar,
    decorators: [
        Story => (
            <div className="relative h-screen">
                <Story />
            </div>
        ),
    ],
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Sidebar: Story = {
    decorators: [
        function Component(Story, ctx) {
            const [, setArgs] = useArgs<typeof ctx.args>();

            const onToggle = () => {
                ctx.args.onToggle?.();
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
                <DriveView
                    type="public"
                    name="Public Drives"
                    className="mx-2"
                />
                <DriveView type="cloud" name="Secure Cloud Storage" />
                {Array(8)
                    .fill('')
                    .map((_, i) => (
                        <DriveView
                            key={i}
                            type="local"
                            name={`My Drive ${i + 1}`}
                        />
                    ))}
            </>
        ),
    },
};
