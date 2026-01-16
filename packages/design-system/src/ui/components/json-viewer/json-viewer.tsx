import { lazy, Suspense } from "react";
import type { Props } from "react-json-view-lite";
import {
  defaultStyles as _defaultStyles,
  allExpanded,
} from "react-json-view-lite";

const defaultStyles = {
  ..._defaultStyles,
  container: `${_defaultStyles.container} !bg-transparent`,
  label: `${_defaultStyles.label} !text-gray-600`,
  punctuation: `${_defaultStyles.punctuation} !text-gray-700 !font-semibold`,
  collapseIcon: `${_defaultStyles.collapseIcon} !text-gray-600`,
  stringValue: `${_defaultStyles.stringValue} !text-gray-600`,
};

const JsonView = lazy(() =>
  import("react-json-view-lite").then((m) => ({ default: m.JsonView })),
);

export function JsonViewer(props: Props) {
  return (
    <Suspense>
      <JsonView
        {...props}
        shouldExpandNode={props.shouldExpandNode ?? allExpanded}
        style={props.style ?? defaultStyles}
      />
    </Suspense>
  );
}
