import { mockStateWithData } from '@/rwa/mocks/state';
import { Meta, StoryObj } from '@storybook/react';
import { useAssetForm } from '../table/assets/useAssetForm';
import { CreateAssetModal } from './create-asset-modal';

const meta = {
    title: 'RWA/Components/Modal/CreateAssetModal',
    component: CreateAssetModal,
} satisfies Meta<typeof CreateAssetModal>;

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
        const createAssetModalProps = useAssetForm({
            ...args,
            operation: 'create',
            defaultValues: {},
            onSubmitForm: data => {
                console.log({ data });
            },
        });

        return <CreateAssetModal {...args} {...createAssetModalProps} />;
    },
};
