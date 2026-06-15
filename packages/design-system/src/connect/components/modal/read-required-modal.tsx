import { Modal } from "#design-system";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
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
        <div className="border-b border-border pb-2 text-2xl font-bold text-foreground">
          {header}
        </div>
        <div
          ref={contentRef}
          className={twMerge(
            "my-6 max-h-[245px] overflow-scroll rounded-md bg-background p-4 text-center",
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
              "min-h-12 flex-1 transform rounded-xl px-6 py-3 text-base font-semibold transition-all outline-none hover:hover-effect active:active-effect",
              "bg-primary text-primary-foreground",
              disableClose &&
                "cursor-not-allowed bg-secondary hover:hover-effect",
            )}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
