import type React from 'react';

interface AppIconProps {
  width?: number;
  height?: number;
  className?: string;
}

export const AppIcon: React.FC<AppIconProps> = ({
  width = 40,
  height = 48,
  className = ''
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 42"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g filter="url(#filter0_di_2184_4446)">
        <path
          d="M0 6C0 2.68629 2.68629 0 6 0L24 0L32 8V34C32 37.3137 29.3137 40 26 40H6C2.68629 40 0 37.3137 0 34V6Z"
          fill="#F3F5F7"
        />
        <path
          d="M6 0.75H23.6895L31.25 8.31055V34C31.25 36.8995 28.8995 39.25 26 39.25H6C3.10051 39.25 0.75 36.8995 0.75 34V6C0.75 3.10051 3.10051 0.75 6 0.75Z"
          stroke="#FF891D"
          strokeWidth="1.5"
        />
      </g>
      <path
        d="M23 0L32 9H27C24.7909 9 23 7.20914 23 5V0Z"
        fill="#FF891D"
      />
      <path
        d="M10.75 17.917H13.917V14.75H10.75V17.917ZM15.417 18C15.417 18.7824 14.7824 19.417 14 19.417H10.667C9.88459 19.417 9.25 18.7824 9.25 18V14.667C9.25 13.8846 9.88459 13.25 10.667 13.25H14C14.7824 13.25 15.417 13.8846 15.417 14.667V18Z"
        fill="#FF891D"
      />
      <path
        d="M18.0833 17.917H21.2503V14.75H18.0833V17.917ZM22.7503 18C22.7503 18.7824 22.1157 19.417 21.3333 19.417H18.0003C17.2179 19.417 16.5833 18.7824 16.5833 18V14.667C16.5833 13.8846 17.2179 13.25 18.0003 13.25H21.3333C22.1157 13.25 22.7503 13.8846 22.7503 14.667V18Z"
        fill="#FF891D"
      />
      <path
        d="M18.0833 25.251H21.2503V22.084H18.0833V25.251ZM22.7503 25.334C22.7503 26.1164 22.1157 26.751 21.3333 26.751H18.0003C17.2179 26.751 16.5833 26.1164 16.5833 25.334V22.001C16.5833 21.2186 17.2179 20.584 18.0003 20.584H21.3333C22.1157 20.584 22.7503 21.2186 22.7503 22.001V25.334Z"
        fill="#FF891D"
      />
      <path
        d="M10.75 25.251H13.917V22.084H10.75V25.251ZM15.417 25.334C15.417 26.1164 14.7824 26.751 14 26.751H10.667C9.88459 26.751 9.25 26.1164 9.25 25.334V22.001C9.25 21.2186 9.88459 20.584 10.667 20.584H14C14.7824 20.584 15.417 21.2186 15.417 22.001V25.334Z"
        fill="#FF891D"
      />
      <defs>
        <filter
          id="filter0_di_2184_4446"
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
            result="effect1_dropShadow_2184_4446"
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
            result="effect1_dropShadow_2184_4446"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2184_4446"
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
          <feComposite
            in2="hardAlpha"
            operator="arithmetic"
            k2="-1"
            k3="1"
          />
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.04 0"
          />
          <feBlend
            mode="multiply"
            in2="shape"
            result="effect2_innerShadow_2184_4446"
          />
        </filter>
      </defs>
    </svg>
  );
};