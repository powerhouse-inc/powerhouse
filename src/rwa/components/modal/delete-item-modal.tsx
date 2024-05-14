import { DivProps, Icon, Modal, mergeClassNameProps } from '@/powerhouse';
import React, { ComponentPropsWithoutRef, Fragment } from 'react';
import { Button, ButtonProps } from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

export type RWADeleteItemModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    itemName: React.ReactNode;
    dependentItemName: React.ReactNode;
    dependentItemList: React.ReactNode[];
    onContinue: () => void;
    bodyProps?: DivProps;
    continueButtonProps?: ButtonProps;
    headerProps?: DivProps;
    buttonContainerProps?: DivProps;
    containerProps?: DivProps;
};

export const RWADeleteItemModal = (props: RWADeleteItemModalProps) => {
    const {
        itemName,
        dependentItemName,
        dependentItemList,
        onOpenChange,
        onContinue,
        overlayProps,
        contentProps,
        bodyProps = {},
        headerProps = {},
        containerProps = {},
        continueButtonProps = {},
        buttonContainerProps = {},
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
                    Cannot delete {itemName}
                </div>
                <div className="my-6 flex gap-2 rounded-md bg-orange-100 p-4 text-orange-800">
                    <div>
                        <Icon name="error" className="mt-1 text-orange-800" />
                    </div>
                    <div>
                        Warning! Cannot delete this {itemName} because there are{' '}
                        {dependentItemName} that depend on it. Please change or
                        delete those first.
                    </div>
                </div>
                <div
                    {...mergeClassNameProps(
                        bodyProps,
                        'my-6 rounded-md bg-slate-50 p-4 text-slate-200',
                    )}
                >
                    {dependentItemList.map((item, index) => (
                        <Fragment key={index}>{item}</Fragment>
                    ))}
                </div>
                <div
                    {...mergeClassNameProps(
                        buttonContainerProps,
                        'mt-8 flex justify-between gap-3',
                    )}
                >
                    <Button
                        onPress={onContinue}
                        {...mergeClassNameProps(
                            continueButtonProps,
                            twMerge(
                                buttonStyles,
                                'flex-1 bg-gray-800 text-gray-50',
                            ),
                        )}
                    >
                        Back
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
