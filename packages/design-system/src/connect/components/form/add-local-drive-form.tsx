import {
  AvailableOfflineToggle,
  DriveApp,
  FormInput,
  Label,
  LOCAL,
  SharingType,
  SharingTypeFormInput,
} from "@/connect";
import { Button } from "@/powerhouse";
import { SubmitHandler, useForm } from "react-hook-form";

export type AddLocalDriveInput = {
  name: string;
  sharingType: SharingType;
  availableOffline: boolean;
};

type AddLocalDriveFormProps = {
  readonly onSubmit: CreateDriveFormSubmitHandler;
  readonly onCancel: () => void;
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
          <DriveApp location="LOCAL" />
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
        <Button className="mt-2 w-full" type="submit">
          Create new drive
        </Button>
      </div>
    </form>
  );
}
