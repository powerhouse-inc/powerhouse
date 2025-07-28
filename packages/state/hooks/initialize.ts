import { useInitializePHPackages } from "../internal/ph-packages.js";
import { useInitializeProcessorManager } from "../internal/processors.js";
import {
  useInitializeReactor,
  useSubscribeToReactorEvents,
  useSubscribeToWindowEvents,
} from "../internal/reactor.js";
import { type PHPackage, type Reactor } from "../internal/types.js";
import { useSetSelectedDriveAndNodeFromUrl } from "../internal/url.js";

/** Initializes the PH app. */
export function useInitializePHApp(
  reactor?: Promise<Reactor> | undefined,
  phPackages?: Promise<PHPackage[] | undefined>,
) {
  useInitializeReactor(reactor);
  useInitializePHPackages(phPackages);
  useSubscribeToReactorEvents();
  useSubscribeToWindowEvents();
  useInitializeProcessorManager();
  useSetSelectedDriveAndNodeFromUrl();
}
