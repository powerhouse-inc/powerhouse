import type { Props } from "./index.js";
export default function Circle(props: Props) {
  return (
    <svg {...props} viewBox="0 0 16 16" fill="currentcolor">
      <circle cx="8" cy="8" r="6.665" />
    </svg>
  );
}
