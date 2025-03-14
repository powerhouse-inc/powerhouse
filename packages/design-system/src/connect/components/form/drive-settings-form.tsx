import {
  AvailableOfflineToggle,
  DeleteDrive,
  Disclosure,
  Divider,
  DriveNameInput,
  Label,
  LocationInfo,
  PUBLIC,
  type SharingType,
  SharingTypeFormInput,
  SWITCHBOARD,
  type UiDriveNode,
} from "#connect";
import { Button, Icon } from "#powerhouse";
import { useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";

type Inputs = {
  name: string;
  sharingType: SharingType;
  availableOffline: boolean;
};

type DriveSettingsFormProps = {
  readonly uiDriveNode: UiDriveNode;
  readonly onSubmit: DriveSettingsFormSubmitHandler;
  readonly handleCancel: () => void;
  readonly handleDeleteDrive: () => void;
};

export type DriveSettingsFormSubmitHandler = SubmitHandler<Inputs>;

export function DriveSettingsForm(props: DriveSettingsFormProps) {
  const { uiDriveNode, onSubmit } = props;
  const { name, sharingType, availableOffline } = uiDriveNode;

  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [showDangerZone, setShowDangerZone] = useState(false);
  const [showDeleteDrive, setShowDeleteDrive] = useState(false);

  const { register, handleSubmit, control } = useForm<Inputs>({
    mode: "onBlur",
    defaultValues: {
      name,
      sharingType,
      availableOffline,
    },
  });

  const location = sharingType === PUBLIC ? SWITCHBOARD : sharingType;

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DriveNameInput {...register("name")} />
      <Divider className="my-4" />
      <Label htmlFor="sharingType">Sharing settings</Label>
      <SharingTypeFormInput control={control} />
      <Divider className="my-3" />
      <Disclosure
        isOpen={showLocationSettings}
        onOpenChange={() => setShowLocationSettings(!showLocationSettings)}
        title="Location"
      >
        <LocationInfo location={location} />
        <AvailableOfflineToggle {...register("availableOffline")} />
      </Disclosure>
      <Divider className="my-3" />
      <Disclosure
        isOpen={showDangerZone}
        onOpenChange={() => setShowDangerZone(!showDangerZone)}
        title="Danger zone"
      >
        <button
          className="flex gap-2 py-3 font-semibold text-red-900 transition hover:brightness-125"
          onClick={() => setShowDeleteDrive(true)}
          type="button"
        >
          <Icon name="Trash" />
          Delete drive
        </button>
      </Disclosure>
      {showDeleteDrive && showDangerZone ? (
        <DeleteDrive {...props} onCancel={() => setShowDeleteDrive(false)} />
      ) : (
        <>
          <Divider className="my-3" />
          <Button className="mb-4 w-full" type="submit">
            Confirm
          </Button>
        </>
      )}
    </form>
  );
}
