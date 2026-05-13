import {
  setSelectedNode,
  showRevisionHistory,
  useDownloadDocument,
  useGetSwitchboardLink,
  useNodeParentFolderById,
} from "@powerhousedao/reactor-browser";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { ComponentProps } from "react";
import { isDefined } from "remeda";
import { twMerge } from "tailwind-merge";
import { Icon } from "../../../powerhouse/components/icon/icon.js";
import type { ToolbarButtonClickHandler, ToolbarButtonProps } from "./types.js";
import { useRedo, useUndo } from "./use-document-undo-redo.js";

/**
 * Base button component used by the built-in toolbar controls.
 *
 * This component provides the default toolbar button styling and disabled-state
 * behavior while accepting standard `button` props.
 */
export function ToolbarButton(props: ComponentProps<"button">) {
  const { className, children, disabled, ...rest } = props;
  return (
    <button
      {...rest}
      disabled={disabled}
      className={twMerge(
        "grid size-fit place-items-center rounded-lg border border-gray-200 bg-white p-1 text-gray-900",
        disabled
          ? "cursor-not-allowed text-gray-500"
          : "cursor-pointer active:opacity-70",
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Toolbar control for undoing the latest document revision.
 *
 * The button is disabled when there are no revisions available to undo.
 * Provide `children` to replace the default icon, or `onClick` to override the
 * default undo behavior.
 */
export function ToolbarUndoButton(props: ToolbarButtonProps) {
  const {
    className,
    onClick: onClickOverride,
    document,
    children = <Icon name="ArrowCouterclockwise" size={16} />,
  } = props;
  const { undo, canUndo } = useUndo(document?.header.id);
  const disabled = !canUndo;
  const onClick = makeOnClick(document, onClickOverride, undo);

  return (
    <ToolbarButton
      data-testid="toolbar-undo-button"
      aria-label="Undo"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}

/**
 * Toolbar control for redoing the latest undone document revision.
 *
 * The button is disabled when there are no revisions available to redo.
 * Provide `children` to replace the default icon, or `onClick` to override the
 * default redo behavior.
 */
export function ToolbarRedoButton(props: ToolbarButtonProps) {
  const {
    className,
    onClick: onClickOverride,
    document,
    children = (
      <Icon name="ArrowCouterclockwise" className="-scale-x-100" size={16} />
    ),
  } = props;
  const { redo, canRedo } = useRedo(document?.header.id);
  const onClick = makeOnClick(document, onClickOverride, redo);
  const disabled = !canRedo;

  return (
    <ToolbarButton
      data-testid="toolbar-redo-button"
      aria-label="Redo"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}

/**
 * Toolbar control for downloading the current document.
 *
 * Provide `children` to replace the default label, or `onClick` to override the
 * default download behavior.
 */
export function ToolbarDownloadButton(props: ToolbarButtonProps) {
  const {
    className,
    onClick: onClickOverride,
    document,
    children = <span className="px-1 text-xs">Download</span>,
  } = props;
  const downloadDocument = useDownloadDocument(document?.header.id);
  const onClick = makeOnClick(document, onClickOverride, downloadDocument);

  return (
    <ToolbarButton
      data-testid="toolbar-download-button"
      aria-label="Download"
      className={className}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}

/**
 * Toolbar control for opening the current document in Switchboard.
 *
 * Provide `children` to replace the default icon, or `onClick` to override the
 * default behavior.
 */
export function ToolbarSwitchboardButton(props: ToolbarButtonProps) {
  const {
    className,
    onClick: onClickOverride,
    document,
    children = <Icon name="Drive" size={16} />,
  } = props;
  const getSwitchboardLink = useGetSwitchboardLink(document);

  const onClick = makeOnClick(document, onClickOverride, () => {
    getSwitchboardLink?.()
      .then((url) => window.open(url, "_blank"))
      .catch((error) =>
        console.error("Error opening switchboard link:", error),
      );
  });

  return (
    <ToolbarButton
      data-testid="toolbar-switchboard-button"
      aria-label="Open link in Switchboard"
      className={className}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}

/**
 * Toolbar control for showing the current document's revision history.
 *
 * Provide `children` to replace the default icon, or `onClick` to override the
 * default revision-history behavior.
 */
export function ToolbarHistoryButton(props: ToolbarButtonProps) {
  const {
    className,
    onClick: onClickOverride,
    document,
    children = <Icon name="History" size={16} />,
  } = props;
  const onClick = makeOnClick(document, onClickOverride, showRevisionHistory);

  return (
    <ToolbarButton
      data-testid="toolbar-history-button"
      aria-label="Open document revision history"
      className={className}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}

/**
 * Toolbar control for closing the current document view.
 *
 * By default, this selects the current document's parent folder. Provide
 * `children` to replace the default icon, or `onClick` to override the default
 * close behavior.
 */
export function ToolbarCloseButton(props: ToolbarButtonProps) {
  const {
    className,
    onClick: onClickOverride,
    document,
    children = <Icon name="XmarkLight" size={16} />,
  } = props;
  const parentFolder = useNodeParentFolderById(document?.header.id);
  const onClick = makeOnClick(document, onClickOverride, () =>
    setSelectedNode(parentFolder),
  );

  return (
    <ToolbarButton
      data-testid="toolbar-close-button"
      aria-label="Close document"
      className={className}
      onClick={onClick}
    >
      {children}
    </ToolbarButton>
  );
}

/**
 * Creates a toolbar button click handler.
 *
 * If an override is provided, it is called with the current document. Otherwise,
 * the built-in handler is called with the current document.
 */
function makeOnClick(
  document: PHDocument | undefined,
  onClickOverride: ToolbarButtonClickHandler | undefined,
  defaultOnClick: ToolbarButtonClickHandler,
) {
  if (isDefined(onClickOverride)) return () => onClickOverride(document);
  return () => defaultOnClick(document);
}
