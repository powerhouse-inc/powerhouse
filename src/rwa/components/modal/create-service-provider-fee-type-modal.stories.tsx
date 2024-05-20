import { mockStateWithData } from '@/rwa/mocks/state';
import { Meta, StoryObj } from '@storybook/react';
import { useServiceProviderFeeTypeForm } from '../table/service-provider-fee-types/useServiceProviderFeeTypeForm';
import { CreateServiceProviderFeeTypeModal } from './create-service-provider-fee-type-modal';

const meta = {
    title: 'RWA/Components/Modal/CreateServiceProviderFeeTypeModal',
    component: CreateServiceProviderFeeTypeModal,
} satisfies Meta<typeof CreateServiceProviderFeeTypeModal>;

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
        const createServiceProviderFeeTypeModalProps =
            useServiceProviderFeeTypeForm({
                ...args,
                operation: 'create',
                defaultValues: {},
                onSubmitForm: data => {
                    console.log({ data });
                },
            });

        return (
            <CreateServiceProviderFeeTypeModal
                {...args}
                {...createServiceProviderFeeTypeModalProps}
            />
        );
    },
};
