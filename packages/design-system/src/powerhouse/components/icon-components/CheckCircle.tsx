import type { Props } from "./index.js";
export default function CheckCircle(props: Props) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="none" />
      <path
        d="M10.1575 16.8849C10.5032 16.8849 10.8257 16.7467 11.0562 16.5162L18.3142 9.25817L16.517 7.46094L10.1575 13.8204L7.48473 11.1476L5.6875 12.9448L9.25893 16.5162C9.48934 16.7467 9.81192 16.8849 10.1575 16.8849Z"
        fill="currentcolor"
      />
      <path
        d="M2.51367 12C2.51367 6.75314 6.76701 2.5 12.0137 2.5C17.2603 2.5 21.5137 6.75314 21.5137 12C21.5137 17.2468 17.2603 21.5 12.0137 21.5C6.76701 21.5 2.51367 17.2468 2.51367 12Z"
        stroke="currentcolor"
      />
    </svg>
  );
}
