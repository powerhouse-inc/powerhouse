import { Meta, StoryObj } from '@storybook/react';
import { Tooltip } from './tooltip';

const meta = {
    title: 'Connect/Components/Tooltip',
    component: Tooltip,
} satisfies Meta<typeof Tooltip>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: function Wrapper(args) {
        return (
            <>
                <a id="tooltip">hover me</a>
                <Tooltip {...args} anchorSelect="#tooltip">
                    <div>tooltip content</div>
                    <button onClick={() => alert('you can click me')}>
                        click me
                    </button>
                </Tooltip>
            </>
        );
    },
};
