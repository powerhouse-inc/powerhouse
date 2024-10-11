import {
  AvailableOfflineToggle,
  Disclosure,
  Divider,
  DriveName,
  FormInput,
  Label,
  LocationInfo,
  PUBLIC,
  SharingType,
  SWITCHBOARD,
} from "@/connect";
import { Button, Icon } from "@/powerhouse";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useDebounceValue } from "usehooks-ts";

type RemoteDriveDetails = {
  id: string;
  name: string;
  sharingType: SharingType;
  location: typeof SWITCHBOARD;
  availableOffline: boolean;
};

type Inputs = {
  availableOffline: boolean;
};

export type AddRemoteDriveInput = RemoteDriveDetails & { url: string };

export type AddPublicDriveFormProps = {
  readonly sharingType: SharingType;
  readonly onSubmit: (data: AddRemoteDriveInput) => void;
  readonly onCancel: () => void;
  readonly requestPublicDrive: (
    url: string,
  ) => Promise<{ id: string; name: string }>;
};

export function AddRemoteDriveForm(props: AddPublicDriveFormProps) {
  const { sharingType = PUBLIC, requestPublicDrive } = props;
  const [remoteDriveDetails, setPublicDriveDetails] =
    useState<RemoteDriveDetails>();
  const [showLocationSettings, setShowLocationSettings] = useState(false);
  const [isUrlValid, setIsUrlValid] = useState(true);
  const [hasConfirmedUrl, setHasConfirmedUrl] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [url, setUrl] = useState("");
  const [debouncedUrl, setDebouncedUrl] = useDebounceValue(url, 500);

  const { register, handleSubmit, setValue } = useForm<Inputs>({
    mode: "onBlur",
    defaultValues: {
      availableOffline: remoteDriveDetails?.availableOffline ?? false,
    },
  });

  useEffect(() => {
    setDebouncedUrl(url);
  }, [url]);

  useEffect(() => {
    setHasConfirmedUrl(false);
    if (debouncedUrl === "") return;
    fetchPublicDrive().catch(console.error);

    async function fetchPublicDrive() {
      try {
        const { id, name } = await requestPublicDrive(debouncedUrl);
        setPublicDriveDetails({
          id,
          name,
          sharingType,
          location: SWITCHBOARD,
          availableOffline: true,
        });
        setValue("availableOffline", true);
        setIsUrlValid(true);
        setErrorMessage("");
      } catch (error) {
        setPublicDriveDetails(undefined);
        setIsUrlValid(false);
        setErrorMessage((error as Error).message);
      }
    }
  }, [debouncedUrl, setValue, sharingType]);

  function onSubmit({ availableOffline }: Inputs) {
    if (!remoteDriveDetails) return;
    props.onSubmit({
      ...remoteDriveDetails,
      availableOffline,
      url: debouncedUrl,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Label htmlFor="url">Add existing drive</Label>
      {hasConfirmedUrl ? (
        <>
          <DriveName driveName={remoteDriveDetails?.name ?? "New drive"} />
          <Divider className="my-3" />
          <Disclosure
            isOpen={showLocationSettings}
            onOpenChange={() => setShowLocationSettings(!showLocationSettings)}
            title="Location"
          >
            <LocationInfo location={SWITCHBOARD} />
            <AvailableOfflineToggle {...register("availableOffline")} />
          </Disclosure>
          <Divider className="my-3" />
          <Button className="mt-4 w-full" color="dark" type="submit">
            Add drive
          </Button>
        </>
      ) : (
        <>
          <FormInput
            errorMessage={errorMessage}
            icon={<Icon name="BrickGlobe" />}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Drive URL"
            required
            type="url"
            value={url}
          />
          <Divider className="mb-3" />
          <Button
            className="mt-4 w-full"
            color="light"
            disabled={!isUrlValid || url === ""}
            onClick={(e) => {
              e.preventDefault();
              setHasConfirmedUrl(true);
            }}
            type="button"
          >
            Confirm URL
          </Button>
        </>
      )}
    </form>
  );
}
