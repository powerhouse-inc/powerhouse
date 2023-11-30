import { Modal } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';
import { Button } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

export type ConnectUpgradeDriveModalProps = ComponentPropsWithoutRef<
    typeof Modal
> & {
    header: React.ReactNode;
    body: React.ReactNode;
    onContinue: () => void;
    cancelLabel: string;
    continueLabel: string;
};

export const ConnectUpgradeDriveModal = (
    props: ConnectUpgradeDriveModalProps,
) => {
    const {
        body,
        header,
        onOpenChange,
        onContinue,
        cancelLabel,
        continueLabel,
        overlayProps,
        contentProps,
        ...restProps
    } = props;

    return (
        <Modal
            overlayProps={{
                ...overlayProps,
                className: twMerge('top-10', overlayProps?.className),
            }}
            contentProps={{
                ...contentProps,
                className: twMerge('rounded-3xl', contentProps?.className),
            }}
            onOpenChange={onOpenChange}
            {...restProps}
        >
            <div className="w-[400px] p-6 text-[#565868]">
                <div className="border-b border-[#E5E7E8] pb-2 text-2xl font-bold text-[#404446]">
                    {header}
                </div>
                <div className="my-6 rounded-md bg-[#F3F5F7] p-4 text-center text-[#6C7275]">
                    {body}
                </div>
                <div className="mt-8 flex justify-between gap-3">
                    <Button
                        onPress={() => onOpenChange?.(false)}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-[#F3F5F7] text-[##141718]',
                        )}
                    >
                        {cancelLabel}
                    </Button>
                    <Button
                        onPress={onContinue}
                        className={twMerge(
                            buttonStyles,
                            'flex-1 bg-[#404446] text-[#FEFEFE]',
                        )}
                    >
                        {continueLabel}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
