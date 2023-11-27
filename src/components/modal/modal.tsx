/* eslint-disable @typescript-eslint/no-empty-function */
import React, { useContext, useState } from 'react';
import { ModalPropsMapping, ModalType, modals } from './modals';

type MapModalProps<T> = {
    [K in keyof T]: Omit<T[K], 'open' | 'onClose'> & { onClose?: () => void };
};

type ModalProps = MapModalProps<ModalPropsMapping>;

interface ModalContextValue {
    showModal: <T extends ModalType>(
        modalType: T,
        props: ModalProps[T]
    ) => void;
    closeModal: () => void;
}

export const ModalContext = React.createContext<ModalContextValue>({
    showModal: () => {},
    closeModal: () => {},
});

export const useModal = () => {
    const context = useContext(ModalContext);
    return context;
};

export const ModalManager: React.FC<{ children?: React.ReactNode }> = props => {
    const { children } = props;

    const [modalProps, setModalProps] =
        useState<ModalProps[keyof ModalProps]>();
    const [modalType, setModalType] = useState<ModalType>();
    const [open, setOpen] = useState(false);

    const showModal: ModalContextValue['showModal'] = (modalType, props) => {
        setOpen(true);
        setModalProps(props);
        setModalType(modalType);
    };

    const closeModal: ModalContextValue['closeModal'] = () => {
        setOpen(false);
    };

    const ModalComponent = modalType ? modals[modalType] : null;

    return (
        <ModalContext.Provider value={{ showModal, closeModal }}>
            {children}
            {ModalComponent && (
                <ModalComponent
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {...(modalProps as any)}
                    open={open}
                    onClose={closeModal}
                />
            )}
        </ModalContext.Provider>
    );
};
