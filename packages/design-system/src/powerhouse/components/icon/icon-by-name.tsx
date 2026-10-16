import type { IconComponentProps, IconName } from "#design-system";
import { use } from "react";
import { criticalIcons } from "./critical-icons.js";

type IconComponents = Record<
  IconName,
  (props: IconComponentProps) => React.JSX.Element
>;

let loaded: IconComponents | undefined;
let loading: Promise<IconComponents> | undefined;

/** The full icon map, from its own chunk. */
export function loadIconComponents(): Promise<IconComponents> {
  return (loading ??= import("../icon-components/index.js").then((m) => {
    loaded = m.iconComponents;
    return loaded;
  }));
}

/** Renders a named icon; suspends while a non-critical icon's chunk loads. */
export function IconByName({
  name,
  ...props
}: IconComponentProps & { readonly name: IconName }) {
  const Component =
    criticalIcons[name] ?? (loaded ?? use(loadIconComponents()))[name];
  return <Component {...props} />;
}
