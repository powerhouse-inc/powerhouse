import type { ComponentPropsWithRef, ForwardedRef } from "react";
import { forwardRef } from "react";
import { Icon } from "../../../../powerhouse/components/icon/icon.js";
import { FormInput } from "../../form-input/form-input.js";

type DriveNameInputProps = Omit<
  ComponentPropsWithRef<typeof FormInput>,
  "icon" | "id"
> & {
  readonly icon?: React.JSX.Element;
};

export const DriveNameInput = forwardRef(function DriveNameInput(
  props: DriveNameInputProps,
  ref: ForwardedRef<HTMLInputElement>,
) {
  return (
    <FormInput
      {...props}
      icon={props.icon ?? <Icon name="Drive" />}
      id="driveName"
      placeholder="Drive name"
      ref={ref}
    />
  );
});
