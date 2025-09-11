import type React from "react";

interface InfoIconProps {
  width?: number;
  height?: number;
  className?: string;
  fill?: string;
  stroke?: string;
}

export const InfoIcon: React.FC<InfoIconProps> = ({
  width = 16,
  height = 16,
  className = "",
  fill = "none",
  stroke = "#343839",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill={fill}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <g clipPath="url(#clip0_2020_6333)">
        <path
          d="M7.99999 14.6673C11.6819 14.6673 14.6667 11.6825 14.6667 8.00065C14.6667 4.31875 11.6819 1.33398 7.99999 1.33398C4.3181 1.33398 1.33333 4.31875 1.33333 8.00065C1.33333 11.6825 4.3181 14.6673 7.99999 14.6673Z"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 10.6667V8"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M8 5.33398H8.00833"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id="clip0_2020_6333">
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
};
