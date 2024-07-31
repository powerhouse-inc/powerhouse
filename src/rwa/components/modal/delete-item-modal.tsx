import { Icon, Modal } from '@/powerhouse';
import React, { ComponentPropsWithoutRef, Fragment } from 'react';

export type RWADeleteItemModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    itemName: React.ReactNode;
    dependentItemName: React.ReactNode;
    dependentItemList: React.ReactNode[];
    onContinue: () => void;
};

export const RWADeleteItemModal = (props: RWADeleteItemModalProps) => {
    const {
        itemName,
        dependentItemName,
        dependentItemList,
        onOpenChange,
        onContinue,
        ...restProps
    } = props;

    return (
        <Modal
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
                <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
                    Cannot delete {itemName}
                </div>
                <div className="my-6 flex gap-2 rounded-md bg-orange-100 p-4 text-orange-800">
                    <div>
                        <Icon name="Error" className="mt-1 text-orange-800" />
                    </div>
                    <div>
                        Warning! Cannot delete this {itemName} because there are{' '}
                        {dependentItemName} that depend on it. Please change or
                        delete those first.
                    </div>
                </div>
                <div className="my-6 rounded-md bg-slate-50 p-4 text-slate-200">
                    {dependentItemList.map((item, index) => (
                        <Fragment key={index}>{item}</Fragment>
                    ))}
                </div>
                <div className="mt-8 flex justify-between gap-3">
                    <button
                        onClick={onContinue}
                        className="min-h-12 min-w-36 flex-1 rounded-xl bg-gray-800 px-6 py-3 text-base font-semibold text-gray-50 outline-none transition-all hover:scale-105 active:opacity-75"
                    >
                        Back
                    </button>
                </div>
            </div>
        </Modal>
    );
};
