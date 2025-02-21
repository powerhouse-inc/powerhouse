"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SidebarResizeProps {
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange?: (width: number) => void;
}

export const useSidebarResize = ({
  defaultWidth = 300,
  minWidth = 100,
  maxWidth,
  onWidthChange,
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
    }
  }, [isSidebarOpen]);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    onWidthChange?.(isSidebarOpen ? sidebarWidth : 8);
  }, [isSidebarOpen, sidebarWidth, onWidthChange]);

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
      }
    },
    [isResizing, minWidth, maxWidth],
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
