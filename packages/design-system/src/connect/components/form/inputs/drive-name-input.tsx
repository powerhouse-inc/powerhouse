import { FormInput } from "@/connect";
import { Icon } from "@/powerhouse";
import { ComponentPropsWithRef, ForwardedRef, forwardRef } from "react";

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
