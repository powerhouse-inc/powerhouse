import { Button, Icon, Modal } from '@/powerhouse';
import { FixedIncomeType, SPV } from '@/rwa';
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { RWACreateAssetForm, RWACreateAssetInputs } from '../create-asset-form';

const icon = <Icon name="plus" size={16} />;

export interface RWACreateAssetModalProps {
    onSubmit?: (inputs: RWACreateAssetInputs) => void;
    fixedIncomeTypes: FixedIncomeType[];
    spvs: SPV[];
    labels: Record<string, string>;
}

export const RWACreateAssetModal: React.FC<
    RWACreateAssetModalProps
> = props => {
    const { fixedIncomeTypes, spvs, labels, onSubmit } = props;

    const [open, setOpen] = useState(false);
    const { handleSubmit, control } = useForm<RWACreateAssetInputs>();

    const onOpenChange = (open: boolean) => setOpen(open);
    const openModal = () => setOpen(true);
    const closeModal = () => setOpen(false);
    const handleOnSubmit = handleSubmit(data => {
        onSubmit?.(data);
        closeModal();
    });

    return (
        <>
            <Button
                icon={icon}
                size="small"
                onClick={openModal}
                iconPosition="right"
                className="bg-gray-50 px-3 text-sm text-gray-900 hover:bg-gray-50 hover:text-gray-700"
            >
                {labels.button || 'Create Asset'}
            </Button>
            <Modal
                open={open}
                onOpenChange={onOpenChange}
                contentProps={{
                    className:
                        'rounded-md overflow-hidden w-full max-w-[548px]',
                }}
            >
                <div>
                    <div className="flex justify-between bg-gray-100 p-3">
                        <div>Create new asset</div>
                        <button onClick={closeModal}>
                            <Icon name="xmark-light" size={16} />
                        </button>
                    </div>
                    <div className="p-6">
                        <RWACreateAssetForm
                            control={control}
                            fixedIncomeTypes={fixedIncomeTypes}
                            spvs={spvs}
                            labels={labels}
                        />
                    </div>
                    <div className="flex justify-end bg-gray-100 p-3">
                        <div className="flex gap-3">
                            <Button
                                onClick={closeModal}
                                className="bg-gray-100 text-gray-600 hover:bg-gray-300"
                            >
                                {labels.cancel || 'Cancel'}
                            </Button>
                            <Button
                                onClick={handleOnSubmit}
                                className="px-6 py-1 text-base"
                            >
                                {labels.createAsset || 'Create Asset'}
                            </Button>
                        </div>
                    </div>
                </div>
            </Modal>
        </>
    );
};
