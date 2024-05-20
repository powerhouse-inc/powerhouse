import { mockStateWithData } from '@/rwa/mocks/state';
import { Meta, StoryObj } from '@storybook/react';
import { useAccountForm } from '../table/accounts/useAccountForm';
import { CreateAccountModal } from './create-account-modal';

const meta = {
    title: 'RWA/Components/Modal/CreateAccountModal',
    component: CreateAccountModal,
} satisfies Meta<typeof CreateAccountModal>;

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
        const createAccountModalProps = useAccountForm({
            ...args,
            operation: 'create',
            defaultValues: {},
            onSubmitForm: data => {
                console.log({ data });
            },
        });

        return <CreateAccountModal {...args} {...createAccountModalProps} />;
    },
};
