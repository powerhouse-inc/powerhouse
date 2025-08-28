import { Icon, Select, type SelectItem } from "@powerhousedao/design-system";
import { type App } from "document-model";
import { type ComponentPropsWithRef } from "react";
import { type Control, Controller, type Path } from "react-hook-form";

export function appToInputOption(app: App): SelectItem<string> {
  return {
    value: app.id,
    displayValue: app.name,
    icon: <Icon name="PowerhouseLogoSmall" />,
    description: "Built by Powerhouse",
  };
}
type AppFormInputProps<T extends { appId: string }> = Omit<
  ComponentPropsWithRef<typeof Select>,
  "id" | "items" | "value" | "onChange"
> & {
  readonly control: Control<T>;
  readonly appOptions: App[];
};

export function AppFormInput<T extends { appId: string }>(
  props: AppFormInputProps<T>,
) {
  const { control, appOptions, ...delegatedProps } = props;
  const items = appOptions.map(appToInputOption);

  return (
    <Controller
      control={control}
      name={"appId" as Path<T>}
      render={({ field }) => (
        <Select {...delegatedProps} {...field} id="appId" items={items} />
      )}
    />
  );
}
