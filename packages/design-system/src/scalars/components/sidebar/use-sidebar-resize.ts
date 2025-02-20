"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { triggerEvent } from "./utils";

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
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(
    Math.max(defaultWidth, minWidth),
  );
  const sidebarRef = useRef<HTMLDivElement>(null);

  // collapse/expand sidebar
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const handleToggleSidebar = useCallback(() => {
    setIsSidebarOpen(!isSidebarOpen);
    // trigger event
    triggerEvent(
      "sidebar:resize:toggle",
      { isSidebarOpen: !isSidebarOpen },
      sidebarRef.current,
    );
  }, [isSidebarOpen]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--sidebar-width",
      `${isSidebarOpen ? sidebarWidth : 8}px`,
    );
  }, [isSidebarOpen, sidebarWidth]);

  // resize sidebar
  const startResizing = useCallback(() => {
    if (isSidebarOpen) {
      setIsResizing(true);
      // trigger event
      triggerEvent(
        "sidebar:resize:start",
        {
          isSidebarOpen,
        },
        sidebarRef.current,
      );
    }
  }, [isSidebarOpen, sidebarWidth]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    // trigger event
    triggerEvent(
      "sidebar:resize",
      {
        isSidebarOpen,
        sidebarWidth: isSidebarOpen ? sidebarWidth : 8,
      },
      sidebarRef.current,
    );
  }, [isSidebarOpen, sidebarWidth]);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        let newWidth =
          mouseMoveEvent.clientX -
          sidebarRef.current.getBoundingClientRect().left;

        if (newWidth < minWidth) {
          newWidth = minWidth;
        }
        if (maxWidth !== undefined && newWidth > maxWidth) {
          newWidth = maxWidth;
        }

        setSidebarWidth(newWidth);
        // trigger event
        triggerEvent(
          "sidebar:resize:active",
          {
            isSidebarOpen,
            sidebarWidth: newWidth,
          },
          sidebarRef.current,
        );
      }
    },
    [isResizing, minWidth, maxWidth, isSidebarOpen],
  );

  useEffect(() => {
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
