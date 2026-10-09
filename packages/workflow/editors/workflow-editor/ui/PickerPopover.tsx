// Hosts the block picker beside the button that opened it, outside the
// canvas transform so zoom never scales it and placement sees the screen.
import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { pickerPlacement, type PickerPlacement } from "./picker-placement.js";

export const PICKER_SIZE = { width: 640, height: 480 };

export function PickerPopover(props: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: (placement: PickerPlacement) => React.ReactNode;
}) {
  const [placement, setPlacement] = useState<PickerPlacement | null>(null);
  const { anchor, onClose } = props;

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      setPlacement(
        pickerPlacement(rect, PICKER_SIZE, {
          width: window.innerWidth,
          height: window.innerHeight,
        }),
      );
    };
    place();
    // The canvas moving under it would leave it pointing at nothing.
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      const inside =
        target instanceof Element && target.closest("[data-selector-open]");
      if (!inside) onClose();
    };
    window.addEventListener("resize", onClose);
    window.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", onClose);
      window.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [anchor, onClose]);

  const host =
    anchor.current?.closest(".react-flow")?.parentElement ?? document.body;
  if (!placement) return null;
  return createPortal(
    <div
      data-selector-open="true"
      className="nodrag nopan nowheel fixed z-50"
      style={
        placement.above
          ? {
              left: placement.left,
              bottom: window.innerHeight - placement.top - placement.height,
            }
          : { left: placement.left, top: placement.top }
      }
    >
      {props.children(placement)}
    </div>,
    host,
  );
}
