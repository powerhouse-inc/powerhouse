import React from "react";

interface ShareIconProps {
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
}

export const ShareIcon: React.FC<ShareIconProps> = ({
  width = 16,
  height = 16,
  className = "",
  stroke = "currentColor",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="18" cy="5" r="3" stroke={stroke} strokeWidth="2.5" />
      <circle cx="6" cy="12" r="3" stroke={stroke} strokeWidth="2.5" />
      <circle cx="18" cy="19" r="3" stroke={stroke} strokeWidth="2.5" />
      <path
        d="M8.59 13.51L15.42 17.49"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15.41 6.51L8.59 10.49"
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
