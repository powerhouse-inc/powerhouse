import { useSelectedDocumentSafe } from "@powerhousedao/reactor-browser";
import { map } from "remeda";
import { controlSlots } from "./constants.js";
import { ToolbarContainer, ToolbarControlsContainer } from "./containers.js";
import type {
  ControlsContainerSlotProps,
  DocumentToolbarProps,
} from "./types.js";
import {
  makeCustomControlsRenderer,
  makeToolbarControlsRenderer,
} from "./utils.js";

/**
 * Renders a document toolbar.
 *
 * By default, the toolbar renders the built-in document controls grouped into
 * toolbar slots. The controls operate on the provided `document`, or on the
 * currently selected document when no document is provided.
 *
 * Use `enabledControls` and `disabledControls` to control which built-in
 * controls are shown. Use `componentOverrides` to replace individual built-in
 * controls while keeping the default toolbar layout. Use `customControls` to
 * insert additional controls before or after the built-in controls in a slot.
 *
 * To take over the toolbar contents completely, pass `children`.
 */
export function DocumentToolbar(props: DocumentToolbarProps) {
  const [selectedDocument] = useSelectedDocumentSafe();
  const {
    toolbarClassName,
    document = selectedDocument,
    toolbarContainer: Container = ToolbarContainer,
  } = props;

  if ("children" in props) {
    return <Container className={toolbarClassName}>{props.children}</Container>;
  }

  return (
    <Container className={toolbarClassName}>
      {map(controlSlots, (slot) => (
        <ControlsContainerSlot
          {...props}
          document={document}
          slot={slot}
          key={slot}
        />
      ))}
    </Container>
  );
}

/**
 * Renders one toolbar controls slot.
 *
 * Custom controls with position `"start"` are rendered before the built-in
 * controls for the slot. Custom controls with position `"end"` are rendered
 * after them.
 */
function ControlsContainerSlot(props: ControlsContainerSlotProps) {
  const {
    slot,
    document,
    controlsContainerClassName,
    enabledControls,
    disabledControls,
    componentOverrides,
    customControls,
    controlsContainer: ControlsContainer = ToolbarControlsContainer,
  } = props;

  const renderToolbarControls = makeToolbarControlsRenderer({
    document,
    enabledControls,
    disabledControls,
    componentOverrides,
  });

  const renderCustomControls = makeCustomControlsRenderer({
    document,
    customControls,
  });

  return (
    <ControlsContainer className={controlsContainerClassName}>
      {renderCustomControls(slot, "start")}
      {renderToolbarControls(slot)}
      {renderCustomControls(slot, "end")}
    </ControlsContainer>
  );
}
