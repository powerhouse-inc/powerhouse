import { Icon, Modal } from '@/powerhouse';
import React, { ComponentPropsWithoutRef, Fragment } from 'react';

export type RWADeleteItemModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    readonly itemName: React.ReactNode;
    readonly dependentItemName: React.ReactNode;
    readonly dependentItemList: React.ReactNode[];
    readonly onContinue: () => void;
};

export function RWADeleteItemModal(props: RWADeleteItemModalProps) {
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
            contentProps={{
                className: 'rounded-3xl',
            }}
            onOpenChange={onOpenChange}
            overlayProps={{
                className: 'top-10',
            }}
            {...restProps}
        >
            <div className="w-[400px] p-6 text-slate-300">
                <div className="border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800">
                    Cannot delete {itemName}
                </div>
                <div className="my-6 flex gap-2 rounded-md bg-orange-100 p-4 text-orange-800">
                    <div>
                        <Icon className="mt-1 text-orange-800" name="Error" />
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
                        className="min-h-12 min-w-36 flex-1 rounded-xl bg-gray-800 px-6 py-3 text-base font-semibold text-gray-50 outline-none transition-all hover:scale-105 active:opacity-75"
                        onClick={onContinue}
                    >
                        Back
                    </button>
                </div>
            </div>
        </Modal>
    );
}
