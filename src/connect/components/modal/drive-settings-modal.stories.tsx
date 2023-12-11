import { useArgs } from '@storybook/preview-api';
import { Meta, StoryObj } from '@storybook/react';
import { DriveSettingsModal } from '.';

const meta = {
    title: 'Connect/Components/Drive Settings Modal',
    component: DriveSettingsModal,
} satisfies Meta<typeof DriveSettingsModal>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        formProps: {
            driveName: 'My Drive',
            sharingType: 'PRIVATE',
            availableOffline: false,
            location: 'CLOUD',
            onSubmit() {},
            onCancel() {},
            onDeleteDrive() {},
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
                <DriveSettingsModal
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
