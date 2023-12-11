import { AddPublicDriveForm, Divider } from '@/connect';
import { DivProps, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
type FormProps = ComponentPropsWithoutRef<typeof AddPublicDriveForm>;
export type AddPublicDriveModalProps = {
    formProps: FormProps;
    modalProps?: ModalProps;
    containerProps?: DivProps;
};
export function AddPublicDriveModal(props: AddPublicDriveModalProps) {
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
                    'min-w-[408px] max-w-[408px] rounded-2xl p-6',
                    props.containerProps?.className,
                )}
            >
                <h1 className="text-xl font-bold">Add drive</h1>
                <Divider className="mb-[18px] mt-4" />
                <AddPublicDriveForm
                    {...props.formProps}
                    onCancel={handleCancel}
                />
            </div>
        </Modal>
    );
}
