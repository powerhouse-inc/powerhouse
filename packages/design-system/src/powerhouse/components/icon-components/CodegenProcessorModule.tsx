import type { IconComponentProps } from "@powerhousedao/design-system";
export default function CodegenProcessorModule(props: IconComponentProps) {
  return (
    <svg
      {...props}
      width="32"
      height="40"
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2488_6501)">
        <g filter="url(#filter0_di_2488_6501)">
          <path
            d="M0 6C0 2.68629 2.68629 0 6 0L24 0L32 8V34C32 37.3137 29.3137 40 26 40H6C2.68629 40 0 37.3137 0 34V6Z"
            fill="#F3F5F7"
          />
          <path
            d="M6 0.75H23.6895L31.25 8.31055V34C31.25 36.8995 28.8995 39.25 26 39.25H6C3.10051 39.25 0.75 36.8995 0.75 34V6C0.75 3.10051 3.10051 0.75 6 0.75Z"
            stroke="#3292ED"
            strokeWidth="1.5"
          />
        </g>
        <path
          d="M17.4545 17.5762L19.3939 20.0004L17.4545 22.4247"
          stroke="#3292ED"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14.5455 17.5762L12.6061 20.0004L14.5455 22.4247"
          stroke="#3292ED"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M22.5455 25.6562V14.3438C22.5455 14.108 22.4517 13.8817 22.285 13.715C22.1183 13.5483 21.892 13.4545 21.6562 13.4545H10.3438C10.108 13.4545 9.88166 13.5483 9.71496 13.715C9.54826 13.8817 9.45455 14.108 9.45455 14.3438V25.6562C9.45455 25.892 9.54826 26.1183 9.71496 26.285C9.88166 26.4517 10.108 26.5455 10.3438 26.5455C10.7453 26.5456 11.071 26.8712 11.071 27.2727C11.071 27.6743 10.7453 27.9998 10.3438 28C9.72223 28 9.12603 27.7529 8.68655 27.3134C8.24707 26.874 8 26.2778 8 25.6562V14.3438C8 13.7222 8.24707 13.126 8.68655 12.6866C9.12603 12.2471 9.72223 12 10.3438 12H21.6562C22.2778 12 22.874 12.2471 23.3134 12.6866C23.7529 13.126 24 13.7222 24 14.3438V25.6562C24 26.2778 23.7529 26.874 23.3134 27.3134C22.874 27.7529 22.2778 28 21.6562 28C21.2547 27.9998 20.929 27.6743 20.929 27.2727C20.929 26.8712 21.2547 26.5456 21.6562 26.5455C21.892 26.5455 22.1183 26.4517 22.285 26.285C22.4517 26.1183 22.5455 25.892 22.5455 25.6562Z"
          fill="#3292ED"
        />
        <path
          d="M13.5757 27.2734H14.5454"
          stroke="#3292ED"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M17.4545 27.2734H18.4242"
          stroke="#3292ED"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M23 0L32 9H27C24.7909 9 23 7.20914 23 5V0Z" fill="#3292ED" />
      </g>
      <defs>
        <filter
          id="filter0_di_2488_6501"
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
            result="effect1_dropShadow_2488_6501"
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
            result="effect1_dropShadow_2488_6501"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2488_6501"
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
            result="effect2_innerShadow_2488_6501"
          />
        </filter>
        <clipPath id="clip0_2488_6501">
          <rect width="32" height="40" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
