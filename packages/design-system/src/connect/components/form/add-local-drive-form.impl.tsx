import { PowerhouseButton, type AppOptions } from "#design-system";
import type { SubmitHandler } from "react-hook-form";
import { useForm } from "react-hook-form";
import { FormInput } from "../form-input/form-input.js";
import { AppFormInput } from "./inputs/app-form-input.js";
import { Label } from "./inputs/label.js";

type AddLocalDriveFormProps = {
  readonly onSubmit: CreateDriveFormSubmitHandler;
  readonly onCancel: () => void;
  readonly appOptions: AppOptions[];
};

type CreateDriveFormSubmitHandler = SubmitHandler<AppOptions>;

export function AddLocalDriveForm(props: AddLocalDriveFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<AppOptions>({
    defaultValues: {
      name: "",
      sharingType: "LOCAL",
      availableOffline: false,
      id: props.appOptions[0].id,
    },
  });

  return (
    <form
      name="add-local-drive"
      onSubmit={(e) => void handleSubmit(props.onSubmit)(e)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="name" className="text-sm font-medium text-foreground">
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
            className="text-sm font-medium text-foreground"
          >
            Drive App
          </Label>
          <AppFormInput control={control} appOptions={props.appOptions} />
        </div>
        <PowerhouseButton className="mt-2 w-full" type="submit">
          Create new drive
        </PowerhouseButton>
      </div>
    </form>
  );
}
