import { DivProps, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';
import { Divider } from '..';
import { DriveSettingsForm } from '../drive-settings-form';

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;
type FormProps = ComponentPropsWithoutRef<typeof DriveSettingsForm>;
export type DriveSettingsModalProps = {
    formProps: FormProps;
    modalProps?: ModalProps;
    containerProps?: DivProps;
};
export function DriveSettingsModal(props: DriveSettingsModalProps) {
    function handleDeleteDrive() {
        props.formProps.onDeleteDrive();
        props.modalProps?.onOpenChange?.(false);
    }
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
                <h1 className="text-xl font-bold">Drive Settings</h1>
                <Divider className="mb-[18px] mt-4" />
                <DriveSettingsForm
                    {...props.formProps}
                    onDeleteDrive={handleDeleteDrive}
                    onCancel={handleCancel}
                />
            </div>
        </Modal>
    );
}
