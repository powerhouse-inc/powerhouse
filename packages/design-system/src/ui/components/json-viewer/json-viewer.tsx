import { lazy, Suspense } from "react";
import type { Props } from "react-json-view-lite";

// copied from react-json-view-lite to allow lazy loading the component itself
const styles = {
  "container-base": "_GzYRV",
  "punctuation-base": "_3eOF8",
  pointer: "_1MFti",
  "expander-base": "_f10Tu _1MFti",
  "expand-icon": "_1UmXx",
  "collapse-icon": "_1LId0",
  "collapsed-content-base": "_1pNG9 _1MFti",
  "container-light": "_2IvMF _GzYRV",
  "basic-element-style": "_2bkNM",
  "child-fields-container": "_1BXBN",
  "label-light": "_1MGIk",
  "clickable-label-light": "_2YKJg _1MGIk _1MFti",
  "punctuation-light": "_3uHL6 _3eOF8",
  "value-null-light": "_2T6PJ",
  "value-undefined-light": "_1Gho6",
  "value-string-light": "_vGjyY",
  "value-number-light": "_1bQdo",
  "value-boolean-light": "_3zQKs",
  "value-other-light": "_1xvuR",
  "collapse-icon-light": "_oLqym _f10Tu _1MFti _1LId0",
  "expand-icon-light": "_2AXVT _f10Tu _1MFti _1UmXx",
  "collapsed-content-light": "_2KJWg _1pNG9 _1MFti",
  "container-dark": "_11RoI _GzYRV",
  "expand-icon-dark": "_17H2C _f10Tu _1MFti _1UmXx",
  "collapse-icon-dark": "_3QHg2 _f10Tu _1MFti _1LId0",
  "collapsed-content-dark": "_3fDAz _1pNG9 _1MFti",
  "label-dark": "_2bSDX",
  "clickable-label-dark": "_1RQEj _2bSDX _1MFti",
  "punctuation-dark": "_gsbQL _3eOF8",
  "value-null-dark": "_LaAZe",
  "value-undefined-dark": "_GTKgm",
  "value-string-dark": "_Chy1W",
  "value-number-dark": "_2bveF",
  "value-boolean-dark": "_2vRm-",
  "value-other-dark": "_1prJR",
};
const defaultAriaLables = {
  collapseJson: "collapse JSON",
  expandJson: "expand JSON",
};
const _defaultStyles = {
  container: styles["container-light"],
  basicChildStyle: styles["basic-element-style"],
  childFieldsContainer: styles["child-fields-container"],
  label: styles["label-light"],
  clickableLabel: styles["clickable-label-light"],
  nullValue: styles["value-null-light"],
  undefinedValue: styles["value-undefined-light"],
  stringValue: styles["value-string-light"],
  booleanValue: styles["value-boolean-light"],
  numberValue: styles["value-number-light"],
  otherValue: styles["value-other-light"],
  punctuation: styles["punctuation-light"],
  collapseIcon: styles["collapse-icon-light"],
  expandIcon: styles["expand-icon-light"],
  collapsedContent: styles["collapsed-content-light"],
  noQuotesForStringValues: false,
  quotesForFieldNames: false,
  ariaLables: defaultAriaLables,
  stringifyStringValues: false,
};
const defaultStyles = {
  ..._defaultStyles,
  container: `${_defaultStyles.container} !bg-transparent`,
  label: `${_defaultStyles.label} !text-gray-600`,
  punctuation: `${_defaultStyles.punctuation} !text-gray-700 !font-semibold`,
  collapseIcon: `${_defaultStyles.collapseIcon} !text-gray-600`,
  stringValue: `${_defaultStyles.stringValue} !text-gray-600`,
};

const allExpanded = () => true;

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
