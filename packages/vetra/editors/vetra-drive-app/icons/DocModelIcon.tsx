import type React from 'react';

interface DocModelIconProps {
  width?: number;
  height?: number;
  className?: string;
}

export const DocModelIcon: React.FC<DocModelIconProps> = ({
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
      <g filter="url(#filter0_di_2102_4407)">
        <path
          d="M4 6C4 2.68629 6.68629 0 10 0L28 0L36 8V34C36 37.3137 33.3137 40 30 40H10C6.68629 40 4 37.3137 4 34V6Z"
          fill="#F3F5F7"
        />
        <path
          d="M10 0.75H27.6895L35.25 8.31055V34C35.25 36.8995 32.8995 39.25 30 39.25H10C7.10051 39.25 4.75 36.8995 4.75 34V6C4.75 3.10051 7.10051 0.75 10 0.75Z"
          stroke="#FF6A55"
          strokeWidth="1.5"
        />
      </g>
      <path
        d="M18.0813 19.8653C18.3401 19.5422 18.8117 19.4896 19.1351 19.7481C19.4585 20.0069 19.511 20.4794 19.2522 20.8028L18.2933 22.0001L19.2522 23.1993C19.5108 23.5227 19.4584 23.9943 19.1351 24.253C18.8117 24.5117 18.3401 24.4591 18.0813 24.1358L16.7474 22.4688C16.5286 22.195 16.5285 21.8061 16.7474 21.5323L18.0813 19.8653Z"
        fill="#FF6A55"
      />
      <path
        d="M20.8645 19.7483C21.188 19.4896 21.6605 19.5421 21.9192 19.8655L23.2522 21.5325C23.4713 21.8064 23.4712 22.1952 23.2522 22.469L21.9192 24.136C21.6605 24.4595 21.188 24.512 20.8645 24.2532C20.5414 23.9945 20.489 23.5229 20.7474 23.1995L21.7063 22.0003L20.7474 20.803C20.4886 20.4796 20.5411 20.0071 20.8645 19.7483Z"
        fill="#FF6A55"
      />
      <path
        d="M20.5833 16.001V13.334C20.5833 12.9198 20.919 12.584 21.3333 12.584C21.7475 12.584 22.0833 12.9198 22.0833 13.334V16.001C22.0833 16.1556 22.1448 16.3038 22.2542 16.4131C22.3635 16.5224 22.5117 16.5839 22.6663 16.584H25.3333C25.7475 16.584 26.0833 16.9198 26.0833 17.334C26.0833 17.7482 25.7475 18.084 25.3333 18.084H22.6663C22.1138 18.0839 21.5842 17.8643 21.1936 17.4736C20.803 17.083 20.5833 16.5534 20.5833 16.001Z"
        fill="#FF6A55"
      />
      <path
        d="M13.9166 25.334V14.667C13.9167 14.1146 14.1364 13.585 14.527 13.1943C14.9176 12.8037 15.4472 12.5841 15.9996 12.584H21.9996C22.1985 12.584 22.3893 12.6632 22.5299 12.8037L25.8639 16.1367C26.0045 16.2773 26.0835 16.4682 26.0836 16.667V25.334C26.0836 25.8864 25.8638 26.416 25.4733 26.8066C25.0826 27.1973 24.5522 27.417 23.9996 27.417H15.9996C15.4472 27.4169 14.9176 27.1973 14.527 26.8066C14.1364 26.416 13.9166 25.8864 13.9166 25.334ZM15.4166 25.334C15.4166 25.4886 15.4782 25.6367 15.5875 25.7461C15.6968 25.8554 15.845 25.9169 15.9996 25.917H23.9996C24.1543 25.917 24.3033 25.8555 24.4127 25.7461C24.5219 25.6367 24.5836 25.4885 24.5836 25.334V16.9775L21.6891 14.084H15.9996C15.845 14.0841 15.6968 14.1456 15.5875 14.2549C15.4782 14.3642 15.4167 14.5124 15.4166 14.667V25.334Z"
        fill="#FF6A55"
      />
      <path d="M27 0L36 9H31C28.7909 9 27 7.20914 27 5V0Z" fill="#FF6A55" />
      <defs>
        <filter
          id="filter0_di_2102_4407"
          x="0"
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
            result="effect1_dropShadow_2102_4407"
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
            result="effect1_dropShadow_2102_4407"
          />
          <feBlend
            mode="normal"
            in="SourceGraphic"
            in2="effect1_dropShadow_2102_4407"
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
            result="effect2_innerShadow_2102_4407"
          />
        </filter>
      </defs>
    </svg>
  );
};