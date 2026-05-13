import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { ComponentProps, ReactNode } from "react";
import type { ArrayElement, ObjectMerge, Simplify } from "type-fest";
import type { documentToolbarControls } from "./constants.js";

/**
 * Names of the built-in toolbar controls supported by `DocumentToolbar`.
 *
 * These controls are included in the toolbar by default, and can be selectively
 * enabled, disabled, or replaced with custom implementations.
 *
 * Each built-in control component is also exported from this package, so it can
 * be reused as the basis for a custom control.
 */
export type DocumentToolbarControlName = ArrayElement<
  typeof documentToolbarControls
>;

/**
 * Click handler used by toolbar button components.
 *
 * The toolbar passes the document it is operating on when one is available.
 */
export type ToolbarButtonClickHandler = (document?: PHDocument) => void;

/**
 * Props shared by toolbar button components.
 *
 * These are useful when building custom controls that should behave like the built-in toolbar buttons.
 */
export type ToolbarButtonProps = {
  /**
   * The document the toolbar is operating on, when available.
   */
  document?: PHDocument | undefined;
  /**
   * Button contents.
   */
  children?: ReactNode;
  /**
   * Additional CSS class names to apply to the button.
   */
  className?: string;
  /**
   * Called when the button is clicked.
   *
   * The current document is passed to the handler when available.
   */
  onClick?: ToolbarButtonClickHandler;
};

/**

 * A map of built-in toolbar control names to replacement control components.
 * Provide this when you want to override one or more built-in
 * controls while keeping the rest of the default toolbar layout.
 */
export type ToolbarControlComponents = Partial<
  Record<DocumentToolbarControlName, ToolbarControlComponent>
>;

/**
 * The complete set of built-in toolbar control components.
 */
export type DefaultToolbarControlComponents =
  Required<ToolbarControlComponents>;

/**
 * Component signature for toolbar controls.
 *
 * Control components receive the document that the toolbar is
 * currently operating on, when available.
 */
export type ToolbarControlComponent = (props: {
  document?: PHDocument;
}) => React.JSX.Element | null;

/**
 * Component signature for toolbar container elements.
 *
 * Custom containers should behave like a normal `div` and pass through standard
 * `div` props such as `className`, event handlers, and ARIA attributes.
 */
export type ContainerComponent = (
  props: ComponentProps<"div">,
) => React.JSX.Element;

/**
 * Position for custom controls within a toolbar slot.
 *
 * - `"start"` renders before the built-in controls in the slot.
 * - `"end"` renders after the built-in controls in the slot.
 */
export type ControlPosition = "start" | "end";

/**
 * Toolbar layout slot.
 *
 * The toolbar separates controls into up to three control groups.
 */
export type ControlSlot = "first" | "second" | "third";

/**
 * Custom controls to render in the toolbar.
 *
 * Controls are assigned to one of the toolbar slots. Each slot can receive a
 * single custom control or a list of custom controls.
 */
export type CustomToolbarControls = Partial<
  Record<ControlSlot, CustomToolbarControl | CustomToolbarControlList>
>;

/**
 * A custom toolbar control.
 */
export type CustomToolbarControl = {
  /**
   * Component to render as the custom control.
   */
  component: ToolbarControlComponent;
  /**
   * Where to render the control relative to the built-in controls in the same slot.
   *
   * Defaults to `"start"`.
   */
  position?: ControlPosition;
};

/**
 * A custom toolbar control rendered as part of a list.
 *
 * The `key` is passed to React when rendering multiple custom controls.
 */
type CustomToolbarComponentListItem = Simplify<
  CustomToolbarControl & {
    key: React.Key;
  }
>;

/**
 * A list of custom toolbar controls for a single toolbar slot.
 */
export type CustomToolbarControlList = CustomToolbarComponentListItem[];

type ToolbarClassNameProp = {
  /**
   * Additional CSS class names to apply to the outer toolbar container.
   */
  toolbarClassName?: string;
};

type ControlsContainerClassNameProp = {
  /**
   * Additional CSS class names to each controls container.
   */
  controlsContainerClassName?: string;
};

type EnableControlsProp = {
  /**
   * Built-in controls to enable.
   *
   * When omitted, all built-in controls are enabled unless listed in
   * `disabledControls`.
   */
  enabledControls?: DocumentToolbarControlName[];
};

type DisableControlsProp = {
  /**
   * Built-in controls to disable.
   *
   * When omitted, no built-in controls are disabled.
   */
  disabledControls?: DocumentToolbarControlName[];
};

type DocumentProp = {
  /**
   * Document for the toolbar to operate on.
   *
   * When omitted, the toolbar uses the currently selected document when one is
   * available.
   */
  document?: PHDocument;
};

type ToolbarContainerProp = {
  /**
   * Custom component to use for the outer toolbar container.
   *
   * The component should accept normal `div` props.
   */
  toolbarContainer?: ContainerComponent;
};

type ControlsContainerProp = {
  /**
   * Custom component to use for each controls container.
   *
   * The component should accept normal `div` props.
   */
  controlsContainer?: ContainerComponent;
};

type CustomControlsProp = {
  /**
   * Custom controls to add to the toolbar.
   *
   * Use this when you want to add controls before or after the built-in controls
   * within a specific toolbar slot.
   */
  customControls?: CustomToolbarControls;
};

type ChildrenProp = {
  /**
   * Custom toolbar contents.
   *
   * When provided, these children replace the entire default set of controls.
   * Use this for complete control over the toolbar contents and layout.
   */
  children: ReactNode;
};

type ComponentOverridesProp = {
  /**
   * Replacement components for individual built-in controls.
   *
   * Use this when you want to keep the default toolbar structure but change how
   * one or more built-in controls render.
   */
  componentOverrides?: ToolbarControlComponents;
};

/**
 * Props shared by all `DocumentToolbar` rendering modes.
 *
 * These props apply whether the toolbar renders its built-in controls or uses
 * `children` to replace the toolbar contents completely.
 */
type DocumentToolbarSharedProps = DocumentProp &
  ToolbarContainerProp &
  ToolbarClassNameProp;

/**
 * Props for rendering a toolbar with fully custom contents.
 *
 * When `children` is provided, the toolbar renders only those children inside
 * the toolbar container. Built-in controls, custom controls, enabled controls,
 * disabled controls, and component overrides are not used.
 */
export type DocumentToolbarWithChildrenProps = Simplify<
  DocumentToolbarSharedProps & ChildrenProp
>;

/**
 * Props for rendering the default toolbar with optional customization.
 *
 * Use these props to enable or disable built-in controls, override individual
 * built-in control components, add custom controls to toolbar slots, or replace
 * the toolbar/container components.
 */
export type DocumentToolbarWithCustomControlsProps = Simplify<
  DocumentToolbarSharedProps &
    EnableControlsProp &
    DisableControlsProp &
    ControlsContainerClassNameProp &
    ControlsContainerProp &
    ComponentOverridesProp &
    CustomControlsProp
>;

/**
 * Props for `DocumentToolbar`.
 *
 * There are two modes:
 *
 * 1. Provide `children` to replace the toolbar contents completely.
 * 2. Omit `children` to use the built-in toolbar with optional customization.
 */
export type DocumentToolbarProps =
  | DocumentToolbarWithChildrenProps
  | DocumentToolbarWithCustomControlsProps;

/**
 * Internal props used to render a single controls slot.
 */
export type ControlsContainerSlotProps = ObjectMerge<
  DocumentToolbarWithCustomControlsProps,
  { document: PHDocument | undefined; slot: ControlSlot }
>;
