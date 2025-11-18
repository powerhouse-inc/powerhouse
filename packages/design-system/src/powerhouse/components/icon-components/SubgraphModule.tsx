import type { IconComponentProps } from "@powerhousedao/design-system";
export default function SubgraphModule(props: IconComponentProps) {
  return (
    <svg
      {...props}
      width="32"
      height="40"
      viewBox="0 0 32 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2488_6486)">
        <g filter="url(#filter0_di_2488_6486)">
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
        <path d="M23 0L32 9H27C24.7909 9 23 7.20914 23 5V0Z" fill="#3292ED" />
        <path
          d="M20.5882 22.603V17.1091L15.9728 14.3438L11.3575 17.1091V22.603L15.9728 25.3684L20.5882 22.603Z"
          stroke="#3292ED"
          strokeWidth="1.5"
        />
        <ellipse
          cx="16"
          cy="14.3714"
          rx="1.38462"
          ry="1.37137"
          fill="white"
          stroke="#3292ED"
          strokeWidth="1.5"
        />
        <ellipse
          cx="16"
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
          cx="20.6154"
          cy="17.1136"
          rx="1.38462"
          ry="1.37137"
          fill="white"
          stroke="#3292ED"
          strokeWidth="1.5"
        />
        <ellipse
          cx="20.6154"
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
      </g>
      <defs>
        <filter
          id="filter0_di_2488_6486"
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
            result="effect1_dropShadow_2488_6486"
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
            result="effect1_dropShadow_2488_6486"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2488_6486"
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
            result="effect2_innerShadow_2488_6486"
          />
        </filter>
        <clipPath id="clip0_2488_6486">
          <rect width="32" height="40" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
