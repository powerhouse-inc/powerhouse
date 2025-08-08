import type React from 'react';

interface ChevronIconProps {
  width?: number;
  height?: number;
  className?: string;
  stroke?: string;
}

export const ChevronIcon: React.FC<ChevronIconProps> = ({
  width = 24,
  height = 24,
  className = '',
  stroke = 'currentColor'
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
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
        stroke={stroke}
      />
    </svg>
  );
};