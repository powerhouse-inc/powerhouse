import { CreateDriveForm, Divider } from '@/connect';
import { DivProps, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
type FormProps = ComponentPropsWithoutRef<typeof CreateDriveForm>;
export type CreateDriveModalProps = {
    formProps: FormProps;
    modalProps?: ModalProps;
    containerProps?: DivProps;
};
export function CreateDriveModal(props: CreateDriveModalProps) {
    function handleCancel() {
        props.formProps.onCancel();
        props.modalProps?.onOpenChange?.(false);
    }
    return (
        <Modal
            {...props.modalProps}
            contentProps={{
                className: 'rounded-2xl',
            }}
        >
            <div
                {...props.containerProps}
                className={twMerge(
                    'max-w-[408px] rounded-2xl p-6',
                    props.containerProps?.className,
                )}
            >
                <h1 className="text-xl font-bold">Create new drive</h1>
                <Divider className="mb-[18px] mt-4" />
                <CreateDriveForm {...props.formProps} onCancel={handleCancel} />
            </div>
        </Modal>
    );
}
