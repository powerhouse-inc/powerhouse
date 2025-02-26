"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { triggerEvent } from "./utils";

/**
 * Configuration options for the sidebar resize functionality
 */
interface SidebarResizeProps {
  /**
   * The initial width of the sidebar in pixels
   * @default 300
   */
  defaultWidth?: number;
  /**
   * The minimum width the sidebar can be resized to
   * @default 100
   */
  minWidth?: number;
  /**
   * The maximum width the sidebar can be resized to
   * If not provided, there is no maximum width constraint
   */
  maxWidth?: number;
}

/**
 * Custom hook that provides sidebar resizing functionality
 * Handles sidebar width management, collapsing/expanding, and resize events
 */
export const useSidebarResize = ({
  defaultWidth = 300,
  minWidth = 100,
  maxWidth,
}: SidebarResizeProps) => {
  // Track if the sidebar is currently being resized
  const [isResizing, setIsResizing] = useState<boolean>(false);

  // Current width of the sidebar in pixels
  const [sidebarWidth, setSidebarWidth] = useState<number>(
    Math.max(defaultWidth, minWidth),
  );

  // Reference to the sidebar DOM element
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Track if the sidebar is expanded or collapsed
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);

  /**
   * Toggle the sidebar between expanded and collapsed states
   */
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

  /**
   * Start the sidebar resizing process
   * Only works when the sidebar is open
   */
  const startResizing = useCallback(() => {
    if (!isSidebarOpen) return;

    setIsResizing(true);

    // Trigger custom event for external listeners
    triggerEvent("sidebar:resize:start", { isSidebarOpen }, sidebarRef.current);
  }, [isSidebarOpen]);

  /**
   * Stop the sidebar resizing process and trigger final resize event
   */
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

  /**
   * Handle mouse movement during resize operation
   * Calculates and applies new sidebar width based on mouse position
   */
  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (!isResizing || !sidebarRef.current) return;

      // Calculate new width based on mouse position
      const sidebarLeft = sidebarRef.current.getBoundingClientRect().left;
      let newWidth = mouseMoveEvent.clientX - sidebarLeft;

      // Apply constraints (min/max width)
      newWidth = Math.max(newWidth, minWidth);
      if (maxWidth !== undefined) {
        newWidth = Math.min(newWidth, maxWidth);
      }

      // Update sidebar width
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
