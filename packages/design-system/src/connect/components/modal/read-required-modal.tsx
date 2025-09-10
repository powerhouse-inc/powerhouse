import type { DivProps } from "#powerhouse";
import { Modal, mergeClassNameProps } from "#powerhouse";
import type { ComponentPropsWithoutRef } from "react";

import { useEffect, useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

const buttonStyles =
  "min-h-[48px] min-w-[142px] text-base font-semibold py-3 px-6 rounded-xl outline-none active:opacity-75 hover:scale-105 transform transition-all";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export type ReadRequiredModalProps = ComponentPropsWithoutRef<typeof Modal> & {
  readonly header: React.ReactNode;
  readonly body?: React.ReactNode;
  readonly onContinue: () => void;
  readonly closeLabel: string;
  readonly bodyProps?: DivProps;
  readonly continueButtonProps?: ButtonProps;
  readonly headerProps?: DivProps;
  readonly buttonContainerProps?: DivProps;
  readonly containerProps?: DivProps;
};

export function ReadRequiredModal(props: ReadRequiredModalProps) {
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
      contentProps={{
        ...contentProps,
        className: twMerge("rounded-3xl outline-none", contentProps?.className),
      }}
      onOpenChange={onOpenChange}
      overlayProps={{
        ...overlayProps,
        className: overlayProps?.className,
      }}
      {...restProps}
    >
      <div
        {...mergeClassNameProps(containerProps, "w-[500px] p-6 text-slate-300")}
      >
        <div
          {...mergeClassNameProps(
            headerProps,
            "border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800",
          )}
        >
          {header}
        </div>
        <div
          ref={contentRef}
          {...mergeClassNameProps(
            bodyProps,
            "my-6 max-h-[245px] overflow-scroll rounded-md bg-slate-50 p-4 text-center",
          )}
        >
          {body}
          {children}
        </div>
        <div
          {...mergeClassNameProps(
            buttonContainerProps,
            "mt-8 flex justify-between gap-3",
          )}
        >
          <button
            disabled={disableClose}
            onClick={onContinue}
            {...mergeClassNameProps(
              continueButtonProps,
              twMerge(
                buttonStyles,
                "flex-1 bg-gray-800 text-gray-50",
                disableClose &&
                  "cursor-not-allowed bg-gray-300 hover:scale-100",
              ),
            )}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
