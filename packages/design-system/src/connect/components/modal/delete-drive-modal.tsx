import { Icon } from "#powerhouse";

import { useState } from "react";
import { FormInput } from "../form-input/index.js";
import {
  type ConfirmationModalProps,
  ConnectConfirmationModal,
} from "./confirmation-modal.js";

export interface ConnectDeleteDriveModalProps extends ConfirmationModalProps {
  readonly inputPlaceholder: string;
  readonly driveName: string;
}

export const ConnectDeleteDriveModal: React.FC<ConnectDeleteDriveModalProps> = (
  props,
) => {
  const { inputPlaceholder, body, driveName, ...confirmationModalProps } =
    props;

  const [inputName, setInputName] = useState("");

  return (
    <ConnectConfirmationModal
      bodyProps={{ className: "p-0 bg-white my-0" }}
      containerProps={{ className: "w-[450px]" }}
      continueButtonProps={{
        disabled: inputName !== driveName,
        className:
          inputName !== driveName
            ? "bg-red-600 hover:scale-100 cursor-not-allowed active:opacity-100"
            : "bg-red-900",
      }}
      {...confirmationModalProps}
    >
      <div>
        <div className="my-6 rounded-md bg-slate-50 p-4 text-center">
          {body}
        </div>
        <div>
          <FormInput
            hideErrors
            icon={<Icon name="Lock" />}
            onChange={(e) => setInputName(e.target.value)}
            placeholder={inputPlaceholder}
            value={inputName}
          />
        </div>
      </div>
    </ConnectConfirmationModal>
  );
};
