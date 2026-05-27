import type { ComponentPropsWithoutRef } from "react";

import type { DivProps } from "#design-system";
import { Modal } from "#design-system";
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

  const { className: containerClassName, ...restContainerProps } = containerProps;
  const { className: headerClassName, ...restHeaderProps } = headerProps;
  const { className: bodyClassName, ...restBodyProps } = bodyProps;
  const { className: buttonContainerClassName, ...restButtonContainerProps } = buttonContainerProps;
  const { className: continueButtonClassName, ...restContinueButtonProps } = continueButtonProps;

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
        className={twMerge(
          "w-[500px] bg-white p-6 text-slate-300 dark:bg-slate-800 dark:text-slate-600",
          containerClassName,
        )}
        {...restContainerProps}
      >
        <div
          className={twMerge(
            "border-b border-slate-50 pb-2 text-2xl font-bold text-gray-800 dark:border-slate-500 dark:bg-slate-600 dark:text-slate-100",
            headerClassName,
          )}
          {...restHeaderProps}
        >
          {header}
        </div>
        <div
          ref={contentRef}
          className={twMerge(
            "my-6 max-h-[245px] overflow-scroll rounded-md bg-slate-50 p-4 text-center dark:bg-slate-800",
            bodyClassName,
          )}
          {...restBodyProps}
        >
          {body}
          {children}
        </div>
        <div
          className={twMerge("mt-8 flex justify-between gap-3", buttonContainerClassName)}
          {...restButtonContainerProps}
        >
          <button
            disabled={disableClose}
            onClick={onContinue}
            className={twMerge(
              buttonStyles,
              "flex-1 bg-gray-800 text-gray-50 dark:bg-slate-100 dark:text-slate-900",
              disableClose &&
                "cursor-not-allowed bg-gray-300 hover:scale-100 dark:bg-slate-600 dark:text-slate-100",
              continueButtonClassName,
            )}
            {...restContinueButtonProps}
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
