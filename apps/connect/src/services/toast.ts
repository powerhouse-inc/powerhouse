import type { ConnectToastOptions } from "@powerhousedao/design-system/connect/toast";
import {
  ToastContainer as BaseToastContainer,
  toast as baseToast,
} from "@powerhousedao/design-system/connect/toast";
import { createElement, type ComponentProps } from "react";

export const CONNECT_TOAST_CONTAINER_ID = "connect";

type BaseToastContainerProps = ComponentProps<typeof BaseToastContainer>;

export const ToastContainer = (
  props: Omit<BaseToastContainerProps, "containerId"> = {},
) =>
  createElement(BaseToastContainer, {
    containerId: CONNECT_TOAST_CONTAINER_ID,
    ...props,
  });

type ToastArgs = Parameters<typeof baseToast>;
export function toast(content: ToastArgs[0], options?: ConnectToastOptions) {
  const {
    type = "default",
    containerId = CONNECT_TOAST_CONTAINER_ID,
    ...restOptions
  } = options || {};
  return baseToast(content, { type, containerId, ...restOptions });
}
