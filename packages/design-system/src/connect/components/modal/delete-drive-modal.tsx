import { Icon } from "#design-system";
import { useState } from "react";
import { FormInput } from "../form-input/form-input.js";
import type { ConfirmationModalProps } from "./confirmation-modal.js";
import { ConnectConfirmationModal } from "./confirmation-modal.js";

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
      {...confirmationModalProps}
      continueDisabled={inputName !== driveName}
      body={
        <div>
          <div className="my-6 rounded-md bg-gray-50 p-4 text-center dark:bg-slate-800">
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
      }
    ></ConnectConfirmationModal>
  );
};
