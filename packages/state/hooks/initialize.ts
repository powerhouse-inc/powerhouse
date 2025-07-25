import { useInitializeProcessorManager } from "../internal/processors.js";
import { useSetSelectedDriveAndNodeFromUrl } from "../internal/url.js";
import {
  useInitializeReactor,
  useSubscribeToReactorEvents,
  useSubscribeToWindowEvents,
} from "../internal/reactor.js";
import { type Reactor } from "../internal/types.js";

/** Initializes the PH app. */
export function useInitializePHApp(
  createReactor: () => Promise<Reactor> | Reactor | undefined,
) {
  useInitializeReactor(createReactor);
  useSubscribeToReactorEvents();
  useSubscribeToWindowEvents();
  useInitializeProcessorManager();
  useSetSelectedDriveAndNodeFromUrl();
}
