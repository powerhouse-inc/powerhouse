import type { Props } from "./types.js";
export default function Duplicated(props: Props) {
  return (
    <svg
      {...props}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 2H11C12.6569 2 14 3.34315 14 5V12H15V5C15 2.79086 13.2091 1 11 1H4V2Z"
        fill="currentcolor"
      />
      <rect
        x="1.5"
        y="3.5"
        width="11"
        height="11"
        rx="2.5"
        stroke="currentcolor"
      />
    </svg>
  );
}
