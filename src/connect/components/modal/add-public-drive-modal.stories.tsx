import { useArgs } from '@storybook/preview-api';
import { Meta, StoryObj } from '@storybook/react';
import { AddPublicDriveModal } from './add-public-drive-modal';

const meta = {
    title: 'Connect/Components/Add Public Drive Modal',
    component: AddPublicDriveModal,
} satisfies Meta<typeof AddPublicDriveModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        formProps: {
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
            <div className="grid h-full w-full place-items-center">
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
                <AddPublicDriveModal
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
