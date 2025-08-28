import type {
  ToastContainerProps,
  ToastContent,
  ToastOptions,
  TypeOptions,
} from "react-toastify";
import {
  ToastContainer as RToastContainer,
  toast as rToast,
} from "react-toastify";

import { Icon } from "@powerhousedao/design-system";

export type ConnectTypeOptions =
  | "connect-success"
  | "connect-warning"
  | "connect-loading"
  | "connect-deleted";

export type ExtendedTypeOptions = TypeOptions | ConnectTypeOptions;

export type ConnectToastOptions = Omit<ToastOptions, "type"> & {
  type: ExtendedTypeOptions;
};

export function isConnectTypeOptions(
  type: ExtendedTypeOptions,
): type is ConnectTypeOptions {
  return (
    type === "connect-success" ||
    type === "connect-warning" ||
    type === "connect-loading" ||
    type === "connect-deleted"
  );
}

function getDefaultOptions(type: ExtendedTypeOptions): ToastOptions {
  if (isConnectTypeOptions(type)) {
    const options: ToastOptions = {};

    switch (type) {
      case "connect-success":
        options.type = "success";
        options.icon = (
          <Icon className="text-green-800" name="CheckCircleFill" size={24} />
        );
        break;
      case "connect-warning":
        options.type = "warning";
        options.icon = (
          <Icon className="text-gray-600" name="WarningFill" size={24} />
        );
        break;
      case "connect-loading":
        options.type = "default";
        options.icon = (
          <Icon className="text-gray-600" name="ClockFill" size={24} />
        );
        break;
      case "connect-deleted":
        options.type = "error";
        options.icon = (
          <Icon className="text-red-800" name="TrashFill" size={24} />
        );
        break;
    }

    return options;
  }

  return { type };
}

export function toast(content: ToastContent, options?: ConnectToastOptions) {
  const { type = "default", ...restOptions } = options || {};
  const defaultOptions = getDefaultOptions(type);

  return rToast(content, { ...defaultOptions, ...restOptions });
}

const CloseButton: ToastContainerProps["closeButton"] = ({ closeToast }) => (
  <button
    className="flex items-center text-gray-500 hover:text-gray-600"
    onClick={closeToast}
  >
    <Icon name="XmarkLight" size={16} />
  </button>
);

export const ToastContainer: React.FC<ToastContainerProps> = (props) => (
  <RToastContainer closeButton={CloseButton} {...props} />
);
