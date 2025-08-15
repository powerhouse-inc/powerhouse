import { type SharingType } from "document-drive";
import { type ComponentPropsWithRef } from "react";
import { Controller, type Control, type Path } from "react-hook-form";
import { sharingTypeOptions } from "../../../constants/options.js";
import { Select } from "../../select/select.js";

type SharingTypeFormInputProps<T extends { sharingType: SharingType }> = Omit<
  ComponentPropsWithRef<typeof Select>,
  "id" | "items" | "value" | "onChange"
> & {
  readonly control: Control<T>;
};
export function SharingTypeFormInput<T extends { sharingType: SharingType }>(
  props: SharingTypeFormInputProps<T>,
) {
  const { control, ...delegatedProps } = props;

  return (
    <Controller
      control={control}
      name={"sharingType" as Path<T>}
      render={({ field }) => (
        <Select
          {...delegatedProps}
          {...field}
          id="sharingType"
          items={sharingTypeOptions}
        />
      )}
    />
  );
}
