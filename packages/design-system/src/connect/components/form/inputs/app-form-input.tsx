import { Select } from "@/connect";
import { Icon } from "@/powerhouse/components/icon";
import { App } from "document-model/document";
import { ComponentPropsWithRef, useMemo } from "react";
import { Control, Controller, Path } from "react-hook-form";

export type AppInputOption = {
  value: string;
  displayValue: string;
  icon: React.ReactNode;
  description: string;
  disabled?: boolean;
};

export function appToInputOption(app: App, disabled = false): AppInputOption {
  return {
    value: app.id,
    displayValue: app.name,
    icon: <Icon name="PowerhouseLogoSmall" />,
    description: "Built by Powerhouse",
    disabled,
  };
}
type AppFormInputProps<T extends { app: AppInputOption }> = Omit<
  ComponentPropsWithRef<typeof Select>,
  "id" | "value" | "onChange"
> & {
  readonly control: Control<T>;
  readonly appOptions: AppInputOption[];
};
export function AppFormInput<T extends { app: AppInputOption }>(
  props: AppFormInputProps<T>,
) {
  const { control, appOptions, ...delegatedProps } = props;
  const items = useMemo(() => appOptions.map(app appToInputOption), [appOptions]);
  return (
    <Controller
      control={control}
      name={"app" as Path<T>}
      render={({ field }) => (
        <Select {...delegatedProps} {...field} id="app" items={appOptions} />
      )}
    />
  );
}
