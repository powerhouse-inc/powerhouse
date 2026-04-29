import { useEffect } from "react";
import {
  callEventHandlerRegisterFunctions,
  commonGlobalEventHandlerFunctions,
} from "./add-ph-event-handlers.js";

export function useEventHandlers() {
  useEffect(() => {
    if (!window.ph) {
      window.ph = {};
    }
    callEventHandlerRegisterFunctions(commonGlobalEventHandlerFunctions);
  }, []);
}
