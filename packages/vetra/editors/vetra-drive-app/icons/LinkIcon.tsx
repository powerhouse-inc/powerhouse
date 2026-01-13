import React from "react";

interface LinkIconProps {
  width?: number;
  height?: number;
  className?: string;
  fill?: string;
}

export const LinkIcon: React.FC<LinkIconProps> = ({
  width = 16,
  height = 16,
  className = "",
  fill = "currentColor",
}) => {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6.66667 8.66667C6.95297 9.04942 7.31826 9.36612 7.73771 9.59529C8.15717 9.82446 8.62102 9.96074 9.09778 9.99489C9.57454 10.029 10.0531 9.96024 10.5009 9.79319C10.9487 9.62613 11.3554 9.36471 11.6933 9.02667L13.6933 7.02667C14.3005 6.39799 14.6365 5.55598 14.6289 4.68199C14.6213 3.808 14.2708 2.97196 13.6527 2.35394C13.0347 1.73591 12.1987 1.38535 11.3247 1.37775C10.4507 1.37016 9.60869 1.70614 8.98001 2.31333L7.83334 3.45333"
        stroke={fill}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.33334 7.33333C9.04704 6.95058 8.68175 6.63388 8.26229 6.40471C7.84284 6.17554 7.37899 6.03926 6.90223 6.00511C6.42547 5.97096 5.94695 6.03976 5.49911 6.20681C5.05128 6.37387 4.6446 6.63529 4.30668 6.97333L2.30668 8.97333C1.69948 9.60201 1.3635 10.444 1.37109 11.318C1.37869 12.192 1.72925 13.028 2.34728 13.6461C2.9653 14.2641 3.80134 14.6147 4.67533 14.6222C5.54932 14.6298 6.39132 14.2939 7.02001 13.6867L8.16001 12.5467"
        stroke={fill}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
