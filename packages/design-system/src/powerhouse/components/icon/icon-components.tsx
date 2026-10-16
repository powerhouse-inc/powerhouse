import type { IconComponentProps, IconName } from "#design-system";
import { Suspense } from "react";
import { iconNames } from "../icon-components/names.js";
import { IconByName } from "./icon-by-name.js";

/** Every icon by name; non-critical ones load their chunk on first render. */
export const iconComponents = Object.fromEntries(
  iconNames.map((name: IconName) => [
    name,
    (props: IconComponentProps) => (
      <Suspense fallback={null}>
        <IconByName {...props} name={name} />
      </Suspense>
    ),
  ]),
) as Record<IconName, (props: IconComponentProps) => React.JSX.Element>;
