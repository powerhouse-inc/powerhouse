import type { Props } from "./index.js";
export default function CircleInfo(props: Props) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 2C4.8934 2 2 4.8934 2 8C2 11.1066 4.8934 14 8 14C11.1066 14 14 11.1066 14 8C14 4.8934 11.1066 2 8 2ZM0.5 8C0.5 3.85786 3.85786 0.5 8 0.5C12.1422 0.5 15.5 3.85786 15.5 8C15.5 12.1422 12.1422 15.5 8 15.5C3.85786 15.5 0.5 12.1422 0.5 8Z"
        fill="currentcolor"
      />
      <path
        d="M8 12.5C7.58579 12.5 7.25 12.1642 7.25 11.75V8C7.25 7.58579 7.58579 7.25 8 7.25C8.41421 7.25 8.75 7.58579 8.75 8V11.75C8.75 12.1642 8.41421 12.5 8 12.5Z"
        fill="currentcolor"
      />
      <path
        d="M8 5.75C7.58579 5.75 7.25 5.41421 7.25 5C7.25 4.58579 7.58579 4.25 8 4.25C8.41421 4.25 8.75 4.58579 8.75 5C8.75 5.41421 8.41421 5.75 8 5.75Z"
        fill="currentcolor"
      />
    </svg>
  );
}
