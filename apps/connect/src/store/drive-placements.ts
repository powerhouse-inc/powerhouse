import type {
  DrivePlacement,
  DrivePlacements,
} from "@powerhousedao/connect-core/runtime";
import { useCallback, useSyncExternalStore } from "react";

let current: DrivePlacements | undefined;
const listeners = new Set<() => void>();

/** Boot installs the placements a drive can be moved through; none outside router mode. */
export function setDrivePlacements(placements: DrivePlacements | undefined) {
  current = placements;
  for (const listener of [...listeners]) listener();
}

export function getDrivePlacements(): DrivePlacements | undefined {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  let unsubscribe = current?.subscribe(listener);
  const onSet = () => {
    unsubscribe?.();
    unsubscribe = current?.subscribe(listener);
  };
  listeners.add(onSet);
  return () => {
    listeners.delete(listener);
    listeners.delete(onSet);
    unsubscribe?.();
  };
}

/** Where the drive opens in this browser; undefined when it can't be moved. */
export function useDrivePlacement(
  driveId: string | undefined,
): DrivePlacement | undefined {
  const getSnapshot = useCallback(
    () => (driveId ? current?.placementOf(driveId) : undefined),
    [driveId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
