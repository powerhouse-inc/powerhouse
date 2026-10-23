import { closePHModal } from "@powerhousedao/reactor-browser";
import type { ComponentType, ReactNode } from "react";
import { createContext, useContext, useEffect, useRef } from "react";

/** What a modal frame lays out: the modal's title, its content and its buttons. */
export type ModalFrameProps = {
  title: string;
  /** The title element's id, for the dialog's `aria-labelledby`. */
  titleId: string;
  actions: ReactNode;
  children: ReactNode;
};

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    /** Frames every core modal while the route matches; the deepest wins. */
    modalFrame?: ComponentType<ModalFrameProps>;
  }
}

export const ModalFrameContext = createContext<
  ComponentType<ModalFrameProps> | undefined
>(undefined);

/** The frame the matched routes set, if any. */
export function useModalFrame() {
  return useContext(ModalFrameContext);
}

/** A modal `<dialog>`: it opens as a modal, and Escape or a click on the
 * backdrop closes the open modal. */
export function ModalDialog(props: {
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={props.labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        closePHModal();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePHModal();
      }}
      // Tailwind's reset drops the margin that centres a modal dialog.
      className={props.className ? `m-auto ${props.className}` : "m-auto"}
    >
      {props.children}
    </dialog>
  );
}
