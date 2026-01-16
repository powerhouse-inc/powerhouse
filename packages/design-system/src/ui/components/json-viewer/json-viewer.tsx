import type { Props } from "react-json-view-lite";
import {
  JsonView,
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

export function JsonViewer(props: Props) {
  return (
    <JsonView
      {...props}
      shouldExpandNode={props.shouldExpandNode ?? allExpanded}
      style={props.style ?? defaultStyles}
    />
  );
}
