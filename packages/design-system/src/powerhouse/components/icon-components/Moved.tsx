import type { Props } from "./index.js";
export default function Moved(props: Props) {
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
        d="M7.07143 1.96429C7.07143 2.2207 6.86356 2.42857 6.60714 2.42857H5.21429C3.67578 2.42857 2.42857 3.67578 2.42857 5.21429V10.7857C2.42857 12.3242 3.67578 13.5714 5.21429 13.5714H10.7857C12.3242 13.5714 13.5714 12.3242 13.5714 10.7857V9.39286C13.5714 9.13644 13.7793 8.92857 14.0357 8.92857C14.2921 8.92857 14.5 9.13644 14.5 9.39286V10.7857C14.5 12.8371 12.8371 14.5 10.7857 14.5H5.21429C3.16294 14.5 1.5 12.8371 1.5 10.7857V5.21429C1.5 3.16294 3.16294 1.5 5.21429 1.5H6.60714C6.86356 1.5 7.07143 1.70787 7.07143 1.96429Z"
        fill="currentcolor"
      />
      <path
        d="M14 6.5V2.5C14 2.22386 13.7761 2 13.5 2H9.5"
        stroke="currentcolor"
        strokeLinecap="round"
      />
      <path
        d="M7 10L7.28346 9.29136C8.39378 6.51556 10.4269 4.20728 13.0403 2.75539L13.5 2.5"
        stroke="currentcolor"
        strokeLinecap="round"
      />
    </svg>
  );
}
