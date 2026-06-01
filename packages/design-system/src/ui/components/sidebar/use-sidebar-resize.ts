import { useCallback, useEffect, useRef, useState } from "react";
import { triggerEvent } from "./utils.js";

interface SidebarResizeProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
}

export const useSidebarResize = ({
  defaultWidth = 300,
  minWidth = 100,
  maxWidth,
}: SidebarResizeProps) => {
  const [isResizing, setIsResizing] = useState<boolean>(false);

  const [sidebarWidth, setSidebarWidth] = useState<number>(
    Math.max(defaultWidth, minWidth),
  );

  const sidebarRef = useRef<HTMLDivElement>(null);

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  const handleToggleSidebar = useCallback(() => {
    const newState = !isSidebarOpen;
    setIsSidebarOpen(newState);

    // Trigger custom event for external listeners
    triggerEvent(
      "sidebar:resize:toggle",
      { isSidebarOpen: newState },
      sidebarRef.current,
    );
  }, [isSidebarOpen]);

  // Update CSS variable when sidebar width or open state changes
  useEffect(() => {
    const width = isSidebarOpen ? sidebarWidth : 8;
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`);
  }, [isSidebarOpen, sidebarWidth]);

  const startResizing = useCallback(() => {
    if (!isSidebarOpen) return;

    setIsResizing(true);

    // Trigger custom event for external listeners
    triggerEvent("sidebar:resize:start", { isSidebarOpen }, sidebarRef.current);
  }, [isSidebarOpen]);

  const stopResizing = useCallback(() => {
    if (!isResizing) return;

    setIsResizing(false);

    // Trigger custom event for external listeners
    triggerEvent(
      "sidebar:resize",
      {
        isSidebarOpen,
        sidebarWidth: isSidebarOpen ? sidebarWidth : 8,
      },
      sidebarRef.current,
    );
  }, [isResizing, isSidebarOpen, sidebarWidth]);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;

      const sidebarLeft = sidebarRef.current.getBoundingClientRect().left;
      let newWidth = mouseMoveEvent.clientX - sidebarLeft;

      newWidth = Math.max(newWidth, minWidth);
      if (maxWidth !== undefined) {
        newWidth = Math.min(newWidth, maxWidth);
      }

      setSidebarWidth(newWidth);

      // Trigger custom event for external listeners
      triggerEvent(
        "sidebar:resize:active",
        {
          isSidebarOpen,
          sidebarWidth: newWidth,
        },
        sidebarRef.current,
      );
    },
    [isResizing, minWidth, maxWidth, isSidebarOpen],
  );

  // Set up and clean up event listeners for resize operation
  useEffect(() => {
    if (typeof window === "undefined") return;

    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  return {
    sidebarRef,
    startResizing,
    isResizing,
    isSidebarOpen,
    handleToggleSidebar,
  };
};
