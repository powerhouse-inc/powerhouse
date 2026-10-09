// Where the block picker opens beside the button that opened it, kept on
// screen: below when it fits, otherwise on the roomier side, shrunk to fit.

export interface PickerRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PickerSize {
  width: number;
  height: number;
}

export interface PickerPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MARGIN = 8;
const GAP = 6;
// Below this the list shows too little to be worth opening on that side.
const MIN_HEIGHT = 240;

export function pickerPlacement(
  anchor: PickerRect,
  size: PickerSize,
  viewport: PickerSize,
): PickerPlacement {
  const width = Math.min(size.width, viewport.width - 2 * MARGIN);
  const below = viewport.height - anchor.bottom - GAP - MARGIN;
  const above = anchor.top - GAP - MARGIN;
  const downward = below >= Math.min(size.height, MIN_HEIGHT) || below >= above;
  const height = Math.max(
    Math.min(size.height, downward ? below : above),
    Math.min(size.height, MIN_HEIGHT),
  );
  const centre = (anchor.left + anchor.right) / 2;
  const left = Math.min(
    Math.max(centre - width / 2, MARGIN),
    viewport.width - width - MARGIN,
  );
  const top = downward
    ? Math.min(anchor.bottom + GAP, viewport.height - height - MARGIN)
    : Math.max(anchor.top - GAP - height, MARGIN);
  return { left, top: Math.max(top, MARGIN), width, height };
}
