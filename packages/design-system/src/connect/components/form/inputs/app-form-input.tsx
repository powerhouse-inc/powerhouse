import { Icon, type AppOptions } from "#design-system";
import type { ComponentPropsWithRef } from "react";
import type { Control, Path } from "react-hook-form";
import { Controller } from "react-hook-form";
import type { ConnectSelectItem } from "../../select/select.js";
import { ConnectSelect } from "../../select/select.js";

export function appToInputOption(app: AppOptions): ConnectSelectItem<string> {
  return {
    value: app.id,
    displayValue: app.name,
    icon: <Icon name="PowerhouseLogoSmall" />,
    description: "Built by Powerhouse",
  };
}
type AppFormInputProps<T extends AppOptions> = Omit<
  ComponentPropsWithRef<typeof ConnectSelect>,
  "id" | "items" | "value" | "onChange"
> & {
  readonly control: Control<T>;
  readonly appOptions: T[];
};

export function AppFormInput<T extends AppOptions>(
  props: AppFormInputProps<T>,
) {
  const { control, appOptions, ...delegatedProps } = props;
  const items = appOptions.map(appToInputOption);

  return (
    <Controller
      control={control}
      name={"id" as Path<T>}
      render={({ field }) => (
        <ConnectSelect {...delegatedProps} {...field} id="id" items={items} />
      )}
    />
  );
}
