import { Meta, StoryObj } from '@storybook/react';
import { RevisionNumber } from './revision-number';

const meta = {
    title: 'Connect/Components/Revision History/Revision/Revision Number',
    component: RevisionNumber,
} satisfies Meta<typeof RevisionNumber>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        revisionNumber: 1,
        eventId: '21',
        stateHash: 'wH041NamJQq3AHgk8tD/suXDDI=',
    },
};
