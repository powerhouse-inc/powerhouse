import {
  AppFormInput,
  AvailableOfflineToggle,
  FormInput,
  Label,
  LOCAL,
  PowerhouseButton,
  SharingTypeFormInput,
} from "@powerhousedao/design-system";
import type { SharingType } from "document-drive";
import type { App } from "document-model";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";

export type AddLocalDriveInput = {
  name: string;
  sharingType: SharingType;
  availableOffline: boolean;
  appId: string;
};

type AddLocalDriveFormProps = {
  readonly onSubmit: CreateDriveFormSubmitHandler;
  readonly onCancel: () => void;
  readonly appOptions: App[];
};

type CreateDriveFormSubmitHandler = SubmitHandler<AddLocalDriveInput>;

export function AddLocalDriveForm(props: AddLocalDriveFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AddLocalDriveInput>({
    defaultValues: {
      name: "",
      sharingType: LOCAL,
      availableOffline: false,
      appId: props.appOptions[0].id,
    },
  });

  return (
    <form
      onSubmit={handleSubmit(props.onSubmit)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label
            htmlFor="driveName"
            className="text-sm font-medium text-gray-800"
          >
            Drive Name
          </Label>
          <FormInput
            {...register("name", {
              required: "Drive name is required",
            })}
            errorMessage={errors.name?.message}
            placeholder="Drive name"
          />
        </div>
        <div>
          <Label
            htmlFor="driveApp"
            className="text-sm font-medium text-gray-800"
          >
            Drive App
          </Label>
          <AppFormInput control={control} appOptions={props.appOptions} />
        </div>
        <div>
          <Label
            htmlFor="sharingType"
            className="text-sm font-medium text-gray-800"
          >
            Location
          </Label>
          <SharingTypeFormInput control={control} />
        </div>
        <div>
          <AvailableOfflineToggle {...register("availableOffline")} />
        </div>
        <PowerhouseButton className="mt-2 w-full" type="submit">
          Create new drive
        </PowerhouseButton>
      </div>
    </form>
  );
}
