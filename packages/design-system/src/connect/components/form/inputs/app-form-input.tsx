import type { ConnectSelectItem } from "@powerhousedao/design-system";
import { ConnectSelect, Icon } from "@powerhousedao/design-system";
import type { App } from "document-model";
import type { ComponentPropsWithRef } from "react";
import type { Control, Path } from "react-hook-form";
import { Controller } from "react-hook-form";

export function appToInputOption(app: App): ConnectSelectItem<string> {
  return {
    value: app.id,
    displayValue: app.name,
    icon: <Icon name="PowerhouseLogoSmall" />,
    description: "Built by Powerhouse",
  };
}
type AppFormInputProps<T extends { appId: string }> = Omit<
  ComponentPropsWithRef<typeof ConnectSelect>,
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
        <ConnectSelect {...delegatedProps} {...field} id="appId" items={items} />
      )}
    />
  );
}
