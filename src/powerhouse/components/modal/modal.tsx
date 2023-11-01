import {
    Modal as AriaModal,
    Dialog,
    DialogProps,
    ModalOverlay,
    ModalOverlayProps,
} from 'react-aria-components';
import { twMerge } from 'tailwind-merge';

export interface ModalProps
    extends ModalOverlayProps,
        React.RefAttributes<HTMLDivElement> {
    open?: boolean;
    onClose?: () => void;
    children?: React.ReactNode;
    modalProps?: ModalOverlayProps & React.RefAttributes<HTMLDivElement>;
    dialogProps?: DialogProps & React.RefAttributes<HTMLElement>;
}

export const Modal: React.FC<ModalProps> = props => {
    const {
        onClose,
        children,
        open = false,
        modalProps = {},
        dialogProps = {},
        className: modalOverlayClassName,
        ...modalOverlayProps
    } = props;

    const { className: ariaModalClassName, ...ariaModalProps } = modalProps;
    const { className: ariaDialogClassName, ...ariaDialogProps } = dialogProps;

    return (
        <ModalOverlay
            className={({ isEntering, isExiting }) =>
                twMerge(
                    'bg-overlay fixed inset-0 flex justify-center items-start',
                    typeof modalOverlayClassName === 'string' &&
                        modalOverlayClassName,
                    isEntering && 'animate-in fade-in duration-300 ease-out',
                    isExiting && 'animate-out fade-out duration-200 ease-in',
                )
            }
            isDismissable
            isOpen={open}
            onOpenChange={onClose}
            {...modalOverlayProps}
        >
            <AriaModal
                className={({ isEntering, isExiting }) =>
                    twMerge(
                        'flex justify-center relative',
                        typeof ariaModalClassName === 'string' &&
                            ariaModalClassName,
                        isEntering &&
                            'animate-in zoom-in-95 ease-out duration-300',
                        isExiting &&
                            'animate-out zoom-out-95 ease-in duration-200',
                    )
                }
                {...ariaModalProps}
            >
                <Dialog
                    className={twMerge(
                        'bg-white outline-none',
                        typeof ariaDialogClassName === 'string' &&
                            ariaDialogClassName,
                    )}
                    {...ariaDialogProps}
                >
                    {children}
                </Dialog>
            </AriaModal>
        </ModalOverlay>
    );
};
