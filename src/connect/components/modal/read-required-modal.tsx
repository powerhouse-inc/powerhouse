import { DivProps, Modal, mergeClassNameProps } from '@/powerhouse';
import React, {
    ComponentPropsWithoutRef,
    useEffect,
    useRef,
    useState,
} from 'react';
import { twMerge } from 'tailwind-merge';

const buttonStyles =
    'min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all';

type ButtonProps = ComponentPropsWithoutRef<'button'>;

export type ReadRequiredModalProps = ComponentPropsWithoutRef<typeof Modal> & {
    header: React.ReactNode;
    body?: React.ReactNode;
    onContinue: () => void;
    closeLabel: string;
    bodyProps?: DivProps;
    continueButtonProps?: ButtonProps;
    headerProps?: DivProps;
    buttonContainerProps?: DivProps;
    containerProps?: DivProps;
};

export const ReadRequiredModal = (props: ReadRequiredModalProps) => {
    const {
        body,
        header,
        children,
        onOpenChange,
        onContinue,
        closeLabel,
        overlayProps,
        contentProps,
        bodyProps = {},
        headerProps = {},
        containerProps = {},
        continueButtonProps = {},
        buttonContainerProps = {},
        ...restProps
    } = props;

    const [disableClose, setDisableClose] = useState(true);
    const contentRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const checkScroll = () => {
            const element = contentRef.current;
            if (element) {
                if (element.scrollHeight > element.clientHeight) {
                    setDisableClose(true);
                    element.addEventListener('scroll', handleScroll);
                } else {
                    setDisableClose(false);
                }
            }
        };

        const handleScroll = () => {
            const element = contentRef.current;
            if (
                element &&
                element.scrollHeight - element.scrollTop ===
                    element.clientHeight
            ) {
                setDisableClose(false);
            }
        };

        requestAnimationFrame(checkScroll);

        return () => {
            // eslint-disable-next-line react-hooks/exhaustive-deps
            const element = contentRef.current;

            if (element) {
                element.removeEventListener('scroll', handleScroll);
            }
        };
    }, []);

    return (
        <Modal
            overlayProps={{
                ...overlayProps,
                className: overlayProps?.className,
            }}
            contentProps={{
                ...contentProps,
                className: twMerge(
                    'rounded-3xl outline-none',
                    contentProps?.className,
                ),
            }}
            onOpenChange={onOpenChange}
            {...restProps}
        >
            <div
                {...mergeClassNameProps(
                    containerProps,
                    'w-[500px] p-6 text-slate-300',
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
                    ref={contentRef}
                    {...mergeClassNameProps(
                        bodyProps,
                        'my-6 max-h-[245px] overflow-scroll rounded-md bg-slate-50 p-4 text-center text-slate-200',
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
                        onClick={onContinue}
                        disabled={disableClose}
                        {...mergeClassNameProps(
                            continueButtonProps,
                            twMerge(
                                buttonStyles,
                                'flex-1 bg-gray-800 text-gray-50',
                                disableClose &&
                                    'cursor-not-allowed bg-gray-300 hover:scale-100',
                            ),
                        )}
                    >
                        {closeLabel}
                    </button>
                </div>
            </div>
        </Modal>
    );
};
