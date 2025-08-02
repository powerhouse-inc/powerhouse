import { type ViteHotContext } from "vite/types/hot.js";
import { useInitializeHmr } from "../internal/hmr.js";
import { useInitializeProcessorManager } from "../internal/processors.js";
import {
  useInitializeReactor,
  useSubscribeToReactorEvents,
  useSubscribeToWindowEvents,
} from "../internal/reactor.js";
import { type Reactor } from "../internal/types.js";
import { useSetSelectedDriveAndNodeFromUrl } from "../internal/url.js";
import { useInitializeVetraPackages } from "../internal/vetra-packages.js";
import { type VetraPackage } from "../types.js";

/** Initializes the PH app. */
export function useInitializePHApp(
  reactor?: Promise<Reactor> | undefined,
  vetraPackages?: Promise<VetraPackage[] | undefined>,
  hmr?: Promise<ViteHotContext | undefined>,
) {
  useInitializeReactor(reactor);
  useInitializeVetraPackages(vetraPackages);
  useInitializeHmr(hmr);
  useSubscribeToReactorEvents();
  useSubscribeToWindowEvents();
  useInitializeProcessorManager();
  useSetSelectedDriveAndNodeFromUrl();
}
