import { useArgs } from '@storybook/preview-api';
import { Meta, StoryObj } from '@storybook/react';
import { CreateDriveModal } from './create-drive-modal';

const meta = {
    title: 'Connect/Components/Create Drive Modal',
    component: CreateDriveModal,
} satisfies Meta<typeof CreateDriveModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        formProps: {
            location: 'CLOUD',
            onSubmit() {},
            onCancel() {},
        },
        modalProps: {
            open: true,
        },
    },
    render: function Wrapper(args) {
        const [, setArgs] = useArgs<typeof args>();

        return (
            <div className="grid size-full place-items-center">
                <button
                    className="rounded-lg bg-red-500 p-4 text-white"
                    onClick={() => {
                        setArgs({
                            ...args,
                            modalProps: {
                                ...args.modalProps,
                                open: true,
                            },
                        });
                    }}
                >
                    Open Modal
                </button>
                <CreateDriveModal
                    {...args}
                    modalProps={{
                        ...args.modalProps,
                        onOpenChange: open => {
                            setArgs({
                                ...args,
                                modalProps: {
                                    ...args.modalProps,
                                    open,
                                },
                            });
                        },
                    }}
                    formProps={{
                        ...args.formProps,
                        onSubmit: data => {
                            console.log(data);
                            setArgs({
                                ...args,
                                formProps: {
                                    ...args.formProps,
                                    ...data,
                                },
                            });
                        },
                    }}
                />
            </div>
        );
    },
};
