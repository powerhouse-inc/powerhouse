import { mockStateWithData } from '@/rwa/mocks/state';
import { Meta, StoryObj } from '@storybook/react';
import { useFixedIncomeTypeForm } from '../table/fixed-income-types/useFixedIncomeTypeForm';
import { CreateFixedIncomeTypeModal } from './create-fixed-income-type-modal';

const meta = {
    title: 'RWA/Components/Modal/CreateFixedIncomeTypeModal',
    component: CreateFixedIncomeTypeModal,
} satisfies Meta<typeof CreateFixedIncomeTypeModal>;

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
        const createFixedIncomeTypeModalProps = useFixedIncomeTypeForm({
            ...args,
            operation: 'create',
            defaultValues: {},
            onSubmitForm: data => {
                console.log({ data });
            },
        });

        return (
            <CreateFixedIncomeTypeModal
                {...args}
                {...createFixedIncomeTypeModalProps}
            />
        );
    },
};
