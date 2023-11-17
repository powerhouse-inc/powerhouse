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
                    'bg-overlay fixed inset-0 flex items-start justify-center',
                    typeof modalOverlayClassName === 'string' &&
                        modalOverlayClassName,
                    isEntering && 'duration-300 ease-out animate-in fade-in',
                    isExiting && 'duration-200 ease-in animate-out fade-out',
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
                        'relative flex justify-center',
                        typeof ariaModalClassName === 'string' &&
                            ariaModalClassName,
                        isEntering &&
                            'duration-300 ease-out animate-in zoom-in-95',
                        isExiting &&
                            'duration-200 ease-in animate-out zoom-out-95',
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
