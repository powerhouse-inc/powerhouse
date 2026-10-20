import type { ReactNode } from "react";
import { useIsPluginActive } from "./composition.js";

/**
 * Renders its children only when a plugin is present in the served
 * composition — the runtime gate for generic-chrome deletability (rewire R3).
 *
 * This is the demonstration step ahead of extracting the generic components
 * into their own package: it makes "remove the generic plugin → the chrome is
 * gone" true at render time while the code still lives in the Connect app.
 * When those components move to `@powerhousedao/connect-generic`, this gate
 * becomes the seam where the package is dynamically imported (or not) instead
 * of merely not rendered.
 *
 * Presence is activation, classic-preserving: with no declared composition,
 * every plugin reads active, so the chrome renders unchanged.
 */
export function IfPlugin(props: {
  module: string;
  children: ReactNode;
  /** Rendered when the plugin is absent from a declared composition. */
  fallback?: ReactNode;
}): ReactNode {
  const active = useIsPluginActive(props.module);
  return active ? props.children : (props.fallback ?? null);
}
