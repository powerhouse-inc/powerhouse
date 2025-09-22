import type { Props } from "./index.js";
export default function PowerhouseDocumentModule(props: Props) {
  return (
    <svg
      {...props}
      width="32"
      height="40"
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2488_6580)">
        <g filter="url(#filter0_di_2488_6580)">
          <path
            d="M0 6C0 2.68629 2.68629 0 6 0L24 0L32 8V34C32 37.3137 29.3137 40 26 40H6C2.68629 40 0 37.3137 0 34V6Z"
            fill="#F3F5F7"
          />
          <path
            d="M6 0.75H23.6895L31.25 8.31055V34C31.25 36.8995 28.8995 39.25 26 39.25H6C3.10051 39.25 0.75 36.8995 0.75 34V6C0.75 3.10051 3.10051 0.75 6 0.75Z"
            stroke="#343839"
            strokeWidth="1.5"
          />
        </g>
        <path d="M23 0L32 9H27C24.7909 9 23 7.20914 23 5V0Z" fill="#343839" />
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M18.0059 12L11.4164 17.4564C10.4497 18.2568 10.3795 19.7145 11.2645 20.6041L13.5443 22.8957C14.2131 23.568 14.3579 24.6012 13.8995 25.4315L12.4812 28H10.1333C8.95507 28 8 27.0449 8 25.8667V14.1333C8 12.9551 8.95507 12 10.1333 12H18.0059ZM19.2436 12L18.0128 14.2423C17.5589 15.0689 17.7019 16.0955 18.3641 16.7669L20.7825 19.2187C21.6656 20.114 21.5865 21.5751 20.612 22.37L13.7092 28H21.8667C23.0449 28 24 27.0449 24 25.8667V14.1333C24 12.9551 23.0449 12 21.8667 12H19.2436Z"
          fill="#32373B"
        />
      </g>
      <defs>
        <filter
          id="filter0_di_2488_6580"
          x="-4"
          y="-1"
          width="40"
          height="49"
          filterUnits="userSpaceOnUse"
          colorInterpolationFilters="sRGB"
        >
          <feFlood floodOpacity="0" result="BackgroundImageFix" />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feMorphology
            radius="4"
            operator="erode"
            in="SourceAlpha"
            result="effect1_dropShadow_2488_6580"
          />
          <feOffset dy="4" />
          <feGaussianBlur stdDeviation="4" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.02 0"
          />
          <feBlend
            mode="multiply"
            in2="BackgroundImageFix"
            result="effect1_dropShadow_2488_6580"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2488_6580"
            result="shape"
          />
          <feColorMatrix
            in="SourceAlpha"
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0"
            result="hardAlpha"
          />
          <feOffset dy="-1" />
          <feGaussianBlur stdDeviation="0.5" />
          <feComposite in2="hardAlpha" operator="arithmetic" k2="-1" k3="1" />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
          />
          <feBlend
            mode="multiply"
            in2="shape"
            result="effect2_innerShadow_2488_6580"
          />
        </filter>
        <clipPath id="clip0_2488_6580">
          <rect width="32" height="40" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
