import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  defaultTo,
  filter,
  hasAtLeast,
  isArray,
  isDefined,
  isIncludedIn,
  map,
  pipe,
  prop,
} from "remeda";
import {
  defaultControlComponents,
  defaultControlSlots,
  documentToolbarControls,
} from "./constants.js";
import type {
  ControlPosition,
  ControlSlot,
  CustomToolbarControl,
  CustomToolbarControlList,
  CustomToolbarControls,
  DocumentToolbarControlName,
  ToolbarControlComponents,
} from "./types.js";

/**
 * Creates a predicate for checking whether a built-in toolbar control should render.
 *
 * A control renders when it is included in `enabledControls` and absent from
 * `disabledControls`. When `enabledControls` is omitted, all built-in controls
 * are considered enabled. When a control appears in both lists,
 * `disabledControls` takes precedence.
 */
export function makeIsEnabledChecker(args: {
  enabledControls: DocumentToolbarControlName[] | undefined;
  disabledControls: DocumentToolbarControlName[] | undefined;
}) {
  const { enabledControls = documentToolbarControls, disabledControls = [] } =
    args;

  return (control: DocumentToolbarControlName) =>
    isIncludedIn(control, enabledControls) &&
    !isIncludedIn(control, disabledControls);
}

/**
 * Creates a getter for rendering the built-in toolbar controls in a slot.
 *
 * The returned function resolves the controls assigned to a slot, filters them
 * through the enabled/disabled control lists, applies any component overrides,
 * and renders each control with the current document.
 */
export function makeToolbarControlsGetter(args: {
  document: PHDocument | undefined;
  enabledControls?: DocumentToolbarControlName[];
  disabledControls?: DocumentToolbarControlName[];
  componentOverrides?: ToolbarControlComponents;
}) {
  const { document, enabledControls, disabledControls, componentOverrides } =
    args;

  const checkIsEnabled = makeIsEnabledChecker({
    enabledControls,
    disabledControls,
  });

  const getComponent = (control: DocumentToolbarControlName) =>
    pipe(
      prop(componentOverrides, control),
      defaultTo(prop(defaultControlComponents, control)),
      (Component) => <Component document={document} key={control} />,
    );

  return (slot: ControlSlot) =>
    pipe(
      prop(defaultControlSlots, slot),
      filter(checkIsEnabled),
      map(getComponent),
    );
}

/**
 * Checks whether a custom control should render in the requested position.
 *
 * Controls without an explicit position are treated as `"start"`.
 */
function isControlInPosition(
  control: Pick<CustomToolbarControl, "position">,
  position: ControlPosition,
) {
  return defaultTo(control.position, "start") === position;
}

/**
 * Creates a getter for rendering custom controls in a slot and position.
 *
 * The returned function resolves the custom control or controls assigned to a
 * slot, then renders only the controls that belong in the requested position.
 */
export function makeCustomControlsGetter(args: {
  document: PHDocument | undefined;
  customControls: CustomToolbarControls | undefined;
}) {
  const { document, customControls = {} } = args;

  return (slot: ControlSlot, pos: ControlPosition) => {
    const controlOrControlList = prop(customControls, slot);

    if (!isDefined(controlOrControlList)) return null;

    if (isArray(controlOrControlList))
      return renderCustomControlList(controlOrControlList, pos, document);
    return renderCustomControl(controlOrControlList, pos, document);
  };
}

/**
 * Renders a single custom control when it belongs in the requested position.
 */
function renderCustomControl(
  control: CustomToolbarControl,
  pos: ControlPosition,
  document: PHDocument | undefined,
) {
  if (!isControlInPosition(control, pos)) return null;

  const Component = control.component;
  return <Component document={document} />;
}

/**
 * Renders a list of custom controls for the requested position.
 *
 * Returns `null` when no controls in the list belong in that position.
 */
function renderCustomControlList(
  controls: CustomToolbarControlList,
  pos: ControlPosition,
  document: PHDocument | undefined,
) {
  const controlsInPosition = filter(controls, (control) =>
    isControlInPosition(control, pos),
  );

  if (!hasAtLeast(controlsInPosition, 1)) return null;

  return (
    <>
      {map(controlsInPosition, ({ component: Component, key }) => (
        <Component key={key} document={document} />
      ))}
    </>
  );
}
