import { twMerge } from "tailwind-merge";

interface SearchNavigationArrowProps {
  direction: "down" | "up";
  isDisabled: boolean;
  onClick: () => void;
}

export const SearchNavigationArrow: React.FC<SearchNavigationArrowProps> = ({
  direction,
  isDisabled,
  onClick,
}) => (
  <div
    className={twMerge(
      "cursor-pointer px-1 py-0.5 hover:hover-effect",
      isDisabled && "cursor-not-allowed text-muted-foreground",
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
