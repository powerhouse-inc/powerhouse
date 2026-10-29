import { PowerhouseButton } from "@powerhousedao/design-system/connect";
import { LOCAL_BACKEND_NAME } from "@powerhousedao/connect-core/runtime";
import { useState } from "react";
import {
  getDrivePlacements,
  useDrivePlacement,
} from "@powerhousedao/connect/store";

/** Where a switchboard drive opens in this browser, and moving it. */
export function DrivePlacementSection({ driveId }: { driveId: string }) {
  const placement = useDrivePlacement(driveId);
  const [error, setError] = useState<string>();
  if (!placement) return null;
  const { drive, backend, moved, busy } = placement;
  const switchboard = drive.remote;
  const keptHere = backend === LOCAL_BACKEND_NAME;
  const hostConfig =
    drive.configured === LOCAL_BACKEND_NAME
      ? "Copy in this browser"
      : `On ${switchboard} only`;

  const run = (change: () => Promise<void> | undefined) => {
    setError(undefined);
    change()?.catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(`The drive did not move: ${message}`);
    });
  };

  return (
    <section data-testid="drive-placement" className="py-1">
      <h2 className="font-semibold text-muted-foreground">
        Where this drive opens
      </h2>
      <p className="py-2 text-sm text-foreground">
        {keptHere
          ? `A copy is kept in this browser and synced with ${switchboard}.`
          : `Opens on ${switchboard}. Nothing is kept in this browser.`}
      </p>
      {moved ? (
        <p
          role="status"
          className="mb-2 rounded-md bg-muted px-2 py-1 text-xs text-foreground"
        >
          Moved in this browser. Host config: {hostConfig}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <PowerhouseButton
          type="button"
          color="light"
          size="small"
          disabled={busy}
          onClick={() =>
            run(() =>
              getDrivePlacements()?.move(
                driveId,
                keptHere ? switchboard : LOCAL_BACKEND_NAME,
              ),
            )
          }
        >
          {keptHere
            ? `Open on ${switchboard} only`
            : "Keep a copy in this browser"}
        </PowerhouseButton>
        {moved ? (
          <PowerhouseButton
            type="button"
            color="light"
            size="small"
            disabled={busy}
            onClick={() => run(() => getDrivePlacements()?.reset(driveId))}
          >
            Reset to config
          </PowerhouseButton>
        ) : null}
      </div>
      {busy ? (
        <p role="status" className="pt-2 text-xs text-muted-foreground">
          {keptHere
            ? `Opening on ${switchboard}…`
            : "Copying the drive into this browser…"}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="pt-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
