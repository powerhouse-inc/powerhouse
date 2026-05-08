import { useState } from "react";
import { funnel } from "remeda";
import { useIsDragAndDropEnabled } from "./config/editor.js";

export function useDropTarget() {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const isDragAndDropEnabled = useIsDragAndDropEnabled();

  const targetSetter = funnel(() => setIsDropTarget(true), {
    triggerAt: "start",
    minQuietPeriodMs: 100,
  });

  const targetUnsetter = funnel(() => setIsDropTarget(false), {
    triggerAt: "start",
    minQuietPeriodMs: 100,
  });

  function setTarget() {
    if (!isDragAndDropEnabled) return;
    targetUnsetter.cancel();
    targetSetter.call();
  }

  function unsetTarget() {
    if (!isDragAndDropEnabled) return;
    targetSetter.cancel();
    targetUnsetter.call();
  }

  return {
    isDropTarget,
    setTarget,
    unsetTarget,
  };
}
