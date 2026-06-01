import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Modal } from "#design-system";
import { twMerge } from "tailwind-merge";

type ModalProps = ComponentPropsWithoutRef<typeof Modal>;

export type ReadRequiredModalProps = {
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly header: ReactNode;
  readonly body?: ReactNode;
  readonly closeLabel: string;
  readonly onContinue: () => void;
  readonly bodyClassName?: string;
  readonly overlayProps?: ModalProps["overlayProps"];
  readonly contentProps?: ModalProps["contentProps"];
};

export function ReadRequiredModal(props: ReadRequiredModalProps) {
  const {
    open,
    onOpenChange,
    header,
    body,
    closeLabel,
    onContinue,
    bodyClassName,
    overlayProps,
    contentProps,
  } = props;

  const [disableClose, setDisableClose] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const checkScroll = () => {
      const element = contentRef.current;
      if (element) {
        if (element.scrollHeight > element.clientHeight) {
          setDisableClose(true);
          element.addEventListener("scroll", handleScroll);
        } else {
          setDisableClose(false);
        }
      }
    };

    const handleScroll = () => {
      const element = contentRef.current;
      if (
        element &&
        element.scrollHeight - Math.ceil(element.scrollTop) ===
          element.clientHeight
      ) {
        setDisableClose(false);
      }
    };

    requestAnimationFrame(checkScroll);

    return () => {
      const element = contentRef.current;
      if (element) {
        element.removeEventListener("scroll", handleScroll);
      }
    };
  }, []);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      overlayProps={overlayProps}
      contentProps={contentProps}
    >
      <div className="w-[500px] p-6">
        <div className="border-b border-slate-100 pb-2 text-2xl font-bold text-gray-900 dark:border-slate-500 dark:text-slate-100">
          {header}
        </div>
        <div
          ref={contentRef}
          className={twMerge(
            "my-6 max-h-[245px] overflow-scroll rounded-md bg-gray-50 p-4 text-center dark:bg-slate-700",
            bodyClassName,
          )}
        >
          {body}
        </div>
        <div className="mt-8 flex justify-between gap-3">
          <button
            disabled={disableClose}
            onClick={onContinue}
            className={twMerge(
              "min-h-12 flex-1 transform rounded-xl px-6 py-3 text-base font-semibold transition-all outline-none hover:scale-105 active:opacity-75",
              "bg-gray-800 text-gray-50 dark:bg-slate-100 dark:text-slate-900",
              disableClose &&
                "cursor-not-allowed bg-gray-300 hover:scale-100 dark:bg-slate-600 dark:text-slate-100",
            )}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
