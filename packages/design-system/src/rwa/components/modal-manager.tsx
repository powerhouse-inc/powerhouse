import React, { useCallback, useMemo, useState } from "react";
import { modals } from "./modal-components.js";
import { ModalContext } from "./modal-context.js";
import type { ModalContextValue, ModalProps, ModalType } from "./types.js";

export const ModalManager: React.FC<{
  readonly children?: React.ReactNode;
}> = (props) => {
  const { children } = props;

  const [modalProps, setModalProps] = useState<ModalProps[keyof ModalProps]>();
  const [modalType, setModalType] = useState<ModalType>();
  const [open, setOpen] = useState(false);

  const showModal: ModalContextValue["showModal"] = useCallback(
    (modalType, props) => {
      setOpen(true);
      setModalProps(props);
      setModalType(modalType);
    },
    [],
  );

  const closeModal: ModalContextValue["closeModal"] = useCallback(() => {
    setOpen(false);
  }, []);

  const ModalComponent = modalType ? modals[modalType] : null;

  const value = useMemo(
    () => ({ showModal, closeModal }),
    [closeModal, showModal],
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      {ModalComponent ? (
        <ModalComponent
          {...(modalProps as any)}
          onOpenChange={setOpen}
          open={open}
        />
      ) : null}
    </ModalContext.Provider>
  );
};
