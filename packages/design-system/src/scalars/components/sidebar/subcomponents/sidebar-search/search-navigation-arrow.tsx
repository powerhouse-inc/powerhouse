import { cn } from "../../../../lib/utils.js";

interface SearchNavigationArrowProps {
  direction: "up" | "down";
  isDisabled: boolean;
  onClick: () => void;
}

export const SearchNavigationArrow: React.FC<SearchNavigationArrowProps> = ({
  direction,
  isDisabled,
  onClick,
}) => (
  <div
    className={cn(
      "cursor-pointer px-1 py-0.5 hover:text-gray-700 dark:hover:text-gray-300",
      isDisabled && "cursor-not-allowed text-gray-200 dark:text-gray-900",
    )}
    onClick={onClick}
  >
    <svg
      width="8"
      height="6"
      viewBox="0 0 8 6"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={
          direction === "up"
            ? "M0.266663 5.6001H7.73333L4 0.800097L0.266663 5.6001Z"
            : "M0.266663 0.399902H7.73333L4 5.1999L0.266663 0.399902Z"
        }
        fill="currentcolor"
      />
    </svg>
  </div>
);
