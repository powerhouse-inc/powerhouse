import type { Props } from "./types.js";
export default function Exclamation(props: Props) {
  return (
    <svg {...props} viewBox="0 0 16 16" fill="currentcolor">
      <path d="M9 4C9 3.448 8.552 3 8 3C7.448 3 7 3.448 7 4V9C7 9.552 7.448 10 8 10C8.552 10 9 9.552 9 9V4Z" />
      <path d="M9 12C9 11.448 8.552 11 8 11C7.448 11 7 11.448 7 12C7 12.552 7.448 13 8 13C8.552 13 9 12.552 9 12Z" />
    </svg>
  );
}
