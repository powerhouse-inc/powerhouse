import type React from 'react';

interface SubgraphIconProps {
  width?: number;
  height?: number;
  className?: string;
}

export const SubgraphIcon: React.FC<SubgraphIconProps> = ({
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
      <g filter="url(#filter0_di_2184_4816)">
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
        d="M23 0L32 9H27C24.7909 9 23 7.20914 23 5V0Z"
        fill="#3292ED"
      />
      <path
        d="M20.5882 22.603V17.1091L15.9729 14.3438L11.3575 17.1091V22.603L15.9729 25.3684L20.5882 22.603Z"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <ellipse
        cx="16.0001"
        cy="14.3714"
        rx="1.38462"
        ry="1.37137"
        fill="white"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <ellipse
        cx="16.0001"
        cy="25.344"
        rx="1.38462"
        ry="1.37137"
        fill="white"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <ellipse
        cx="11.3846"
        cy="17.1136"
        rx="1.38462"
        ry="1.37137"
        fill="white"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <ellipse
        cx="20.6153"
        cy="17.1136"
        rx="1.38462"
        ry="1.37137"
        fill="white"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <ellipse
        cx="20.6153"
        cy="22.5999"
        rx="1.38462"
        ry="1.37137"
        fill="white"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <ellipse
        cx="11.3846"
        cy="22.5999"
        rx="1.38462"
        ry="1.37137"
        fill="white"
        stroke="#3292ED"
        strokeWidth="1.5"
      />
      <defs>
        <filter
          id="filter0_di_2184_4816"
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
            result="effect1_dropShadow_2184_4816"
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
            result="effect1_dropShadow_2184_4816"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2184_4816"
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
            result="effect2_innerShadow_2184_4816"
          />
        </filter>
      </defs>
    </svg>
  );
};