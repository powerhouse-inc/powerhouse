import type { Props } from "./types";
export default function Ellipsis(props: Props) {
  return (
    <svg {...props} viewBox="0 0 10 2" fill="currentcolor">
      <path d="M1 0C1.552 0 2 0.448 2 1C2 1.552 1.552 2 1 2C0.448 2 0 1.552 0 1C0 0.448 0.448 0 1 0ZM5 0C5.552 0 6 0.448 6 1C6 1.552 5.552 2 5 2C4.448 2 4 1.552 4 1C4 0.448 4.448 0 5 0ZM9 0C9.552 0 10 0.448 10 1C10 1.552 9.552 2 9 2C8.448 2 8 1.552 8 1C8 0.448 8.448 0 9 0Z" />
    </svg>
  );
}
