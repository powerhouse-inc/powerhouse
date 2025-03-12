import { useEffect, useRef, useState } from "react";
import { TimeSelectorProps } from "../type";
import {
  BOTTOM_THRESHOLD_OFFSET,
  CENTERING_TIMEOUT_MS,
  SCROLL_TIMEOUT_MS,
  TOP_THRESHOLD_OFFSET,
} from "./time-selector.constants";

interface UseTimeSelectorProps extends TimeSelectorProps {
  containerRef: React.RefObject<HTMLDivElement>;
  selectedRef: React.RefObject<HTMLButtonElement>;
}

interface UseTimeSelectorReturn {
  displayOptions: string[];
  shouldCenter: boolean;
  handleExplicitSelection: (option: string) => void;
}

export const useTimeSelector = ({
  options,
  selectedValue,
  onSelect,
  isCyclic = true,
  containerRef,
  selectedRef,
}: UseTimeSelectorProps): UseTimeSelectorReturn => {
  const [shouldCenter, setShouldCenter] = useState(false);
  const lastScrollTop = useRef(0);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialRenderRef = useRef(true);

  // Initial centering on component mount
  useEffect(() => {
    if (initialRenderRef.current && selectedRef.current && selectedValue) {
      // Center the selected value on initial render
      selectedRef.current.scrollIntoView({
        behavior: "auto", // Use 'auto' for initial centering to avoid animation on load
        block: "center",
      });
      initialRenderRef.current = false;
    }
  }, [selectedValue, selectedRef]);

  // Scroll to the selected value only when explicitly requested
  useEffect(() => {
    if (selectedRef.current && containerRef.current) {
      const selected = selectedRef.current;
      const container = containerRef.current;
      const selectedRect = selected.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Check if the selected element is visible
      const isVisible =
        selectedRect.top >= containerRect.top &&
        selectedRect.bottom <= containerRect.bottom;

      // Only scroll if the element is not visible or if centering was explicitly requested
      if (!isVisible || shouldCenter) {
        const offset =
          selectedRect.top -
          containerRect.top -
          containerRect.height / 2 +
          selectedRect.height / 2;

        container.scrollBy({
          top: offset,
          behavior: initialRenderRef.current ? "auto" : "smooth",
        });
      }

      initialRenderRef.current = false;
      // Reset shouldCenter after centering
      if (shouldCenter) setShouldCenter(false);
    }
  }, [selectedValue, shouldCenter, containerRef, selectedRef]);

  // Handle cyclic behavior
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isCyclic) return;

    const handleScroll = () => {
      if (!container) return;

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }

      scrollTimeoutRef.current = setTimeout(() => {}, SCROLL_TIMEOUT_MS);

      const { scrollTop, scrollHeight, clientHeight } = container;
      const currentScrollTop = scrollTop;
      const scrollDirection =
        currentScrollTop > lastScrollTop.current ? "down" : "up";
      lastScrollTop.current = currentScrollTop;

      const bottomThreshold =
        scrollHeight - clientHeight - BOTTOM_THRESHOLD_OFFSET;
      const topThreshold = TOP_THRESHOLD_OFFSET;

      if (scrollDirection === "down" && scrollTop >= bottomThreshold) {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = scrollHeight / 2;
          }
        });
      } else if (scrollDirection === "up" && scrollTop <= topThreshold) {
        requestAnimationFrame(() => {
          if (container) {
            container.scrollTop = scrollHeight / 2;
          }
        });
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [options, selectedValue, onSelect, isCyclic, containerRef]);

  // Create a repeating list of options for infinite scroll effect
  const displayOptions = isCyclic
    ? [...options, ...options, ...options]
    : options;

  // Function to handle explicit selection
  const handleExplicitSelection = (option: string) => {
    onSelect(option);

    // Use a small timeout to ensure the ref is updated with the new selection
    setTimeout(() => {
      // Request centering through the useEffect hook
      setShouldCenter(true);
    }, CENTERING_TIMEOUT_MS);
  };

  return {
    displayOptions,
    shouldCenter,
    handleExplicitSelection,
  };
};
