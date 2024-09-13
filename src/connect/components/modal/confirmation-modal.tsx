import { DivProps, Modal, mergeClassNameProps } from '@/powerhouse';
import React, { ComponentPropsWithoutRef } from 'react';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

type ButtonProps = ComponentPropsWithoutRef<'button'>;

export type ConfirmationModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    header: React.ReactNode;
    body?: React.ReactNode;
    onCancel: () => void;
    onContinue: () => void;
    cancelLabel: string;
    continueLabel: string;
    bodyProps?: DivProps;
    cancelButtonProps?: ButtonProps;
    continueButtonProps?: ButtonProps;
    headerProps?: DivProps;
    buttonContainerProps?: DivProps;
    containerProps?: DivProps;
};

export const ConnectConfirmationModal = (props: ConfirmationModalProps) => {
    const {
        body,
        header,
        children,
        onCancel,
        onOpenChange,
        onContinue,
        cancelLabel,
        continueLabel,
        overlayProps,
        contentProps,
        bodyProps = {},
        headerProps = {},
        containerProps = {},
        cancelButtonProps = {},
        continueButtonProps = {},
        buttonContainerProps = {},
        ...restProps
    } = props;

    return (
        <Modal
            overlayProps={{
                ...overlayProps,
                className: overlayProps?.className,
            }}
            contentProps={{
                ...contentProps,
                className: twMerge('rounded-3xl', contentProps?.className),
            }}
            onOpenChange={onOpenChange}
            {...restProps}
        >
            <div
                {...mergeClassNameProps(
                    containerProps,
                    'w-[400px] p-6 text-slate-300',
                )}
            >
                <div
                    {...mergeClassNameProps(
                        headerProps,
                        'border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800',
                    )}
                >
                    {header}
                </div>
                <div
                    {...mergeClassNameProps(
                        bodyProps,
                        'my-6 rounded-md bg-slate-50 p-4 text-center text-slate-200',
                    )}
                >
                    {body}
                    {children}
                </div>
                <div
                    {...mergeClassNameProps(
                        buttonContainerProps,
                        'mt-8 flex justify-between gap-3',
                    )}
                >
                    <button
                        onClick={onCancel}
                        {...mergeClassNameProps(
                            cancelButtonProps,
                            twMerge(
                                buttonStyles,
                                'flex-1 bg-slate-50 text-slate-800',
                            ),
                        )}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onContinue}
                        {...mergeClassNameProps(
                            continueButtonProps,
                            twMerge(
                                buttonStyles,
                                'flex-1 bg-gray-800 text-gray-50',
                            ),
                        )}
                    >
                        {continueLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
