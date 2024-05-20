import { Icon, Modal } from '@/powerhouse';
import { ComponentPropsWithoutRef } from 'react';
import { FieldValues, UseFormReset } from 'react-hook-form';
import { twMerge } from 'tailwind-merge';
import { RealWorldAssetsState } from '../table';
import { ModalFormInputs } from './modal-form-inputs';

export type RWACreateItemModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    state: RealWorldAssetsState;
    open: boolean;
    itemName: string;
    defaultValues: FieldValues;
    inputs: {
        label: string;
        Input: () => string | JSX.Element;
    }[];
    onOpenChange: (open: boolean) => void;
    onSubmitForm: (data: FieldValues) => void;
    submit: (e?: React.BaseSyntheticEvent | undefined) => Promise<void>;
    reset: UseFormReset<FieldValues>;
};

export const RWACreateItemModal = (props: RWACreateItemModalProps) => {
    const {
        itemName,
        open,
        state,
        defaultValues,
        inputs,
        onOpenChange,
        reset,
        submit,
        ...restProps
    } = props;

    function handleCancel() {
        reset();
        onOpenChange(false);
    }

    const buttonStyles =
        'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

    return (
        <Modal
            open={open}
            overlayProps={{
                className: 'top-10',
            }}
            contentProps={{
                className: 'rounded-3xl',
            }}
            onOpenChange={onOpenChange}
            {...restProps}
        >
            <div className="w-[400px] p-6 text-slate-300">
                <div className="mb-6 flex justify-between">
                    <h1 className="text-xl font-bold">Create {itemName}</h1>
                    <button
                        className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-gray-500 outline-none hover:text-gray-900"
                        onClick={handleCancel}
                        tabIndex={-1}
                    >
                        <Icon name="xmark-light" size={24} />
                    </button>
                </div>
                <ModalFormInputs inputs={inputs} />
                <div className="mt-8 flex justify-between gap-3">
                    <button
                        onClick={handleCancel}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-slate-50 text-slate-800',
                        )}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={submit}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-gray-800 text-gray-50',
                        )}
                    >
                        Save
                    </button>
                </div>
            </div>
        </Modal>
    );
};
