import type { Props } from "./types.js";
export default function ArrowLeft(props: Props) {
  return (
    <svg {...props} viewBox="0 0 16 16" fill="none" stroke="currentcolor">
      <path
        d="M8 1L0.999998 8M0.999998 8L8 15M0.999998 8L15 8"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
