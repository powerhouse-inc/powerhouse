import { mockStateWithData } from '@/rwa/mocks/state';
import { Meta, StoryObj } from '@storybook/react';
import { useSpvForm } from '../table/spvs/useSpvForm';
import { CreateSpvModal } from './create-spv-modal';

const meta = {
    title: 'RWA/Components/Modal/CreateSpvModal',
    component: CreateSpvModal,
} satisfies Meta<typeof CreateSpvModal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        open: true,
        onOpenChange: () => {},
        state: mockStateWithData,
        inputs: [],
        submit: () => Promise.resolve(),
        reset: () => {},
        onSubmitForm: () => {},
    },
    render: function Wrapper(args) {
        const createSpvModalProps = useSpvForm({
            ...args,
            operation: 'create',
            defaultValues: {},
            onSubmitForm: data => {
                console.log({ data });
            },
        });

        return <CreateSpvModal {...args} {...createSpvModalProps} />;
    },
};
