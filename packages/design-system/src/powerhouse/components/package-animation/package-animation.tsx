import { useEffect, useRef, useState } from "react";

const FRAME_DURATION = 60;
const HOLD_LAST_FRAME = 800;

const frames = [
  // frame 1
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M15.3998 27.782C15.6431 27.9224 15.919 27.9963 16.1998 27.9963C16.4807 27.9963 16.7566 27.9224 16.9998 27.782L22.5997 24.5821C22.8427 24.4418 23.0445 24.24 23.1849 23.9971C23.3253 23.7542 23.3994 23.4787 23.3996 23.1981V16.7982C23.3994 16.5177 23.3253 16.2421 23.1849 15.9992C23.0445 15.7563 22.8427 15.5546 22.5997 15.4143L16.9998 12.2144C16.7566 12.0739 16.4807 12 16.1998 12C15.919 12 15.6431 12.0739 15.3998 12.2144L9.79998 15.4143C9.557 15.5546 9.35518 15.7563 9.21476 15.9992C9.07435 16.2421 9.00029 16.5177 9 16.7982V23.1981C9.00029 23.4787 9.07435 23.7542 9.21476 23.9971C9.35518 24.24 9.557 24.4418 9.79998 24.5821L15.3999 27.782Z"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1997 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.23193 15.9985L16.1998 19.9984L23.1676 15.9985"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.6001 13.8145L19.7999 17.9344"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  // frame 2
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19.7996 13.8145L16.8801 15.5"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.9998 14L18.9998 17.5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M16.1998 27.9963C16.4807 27.9963 16.7566 27.9224 16.9998 27.782L22.5997 24.5821C22.8427 24.4418 23.0445 24.24 23.1849 23.9971C23.3253 23.7542 23.3994 23.4787 23.3997 23.1981V16.7982C23.3994 16.5177 23.3253 16.2421 23.1849 15.9992C23.0445 15.7563 22.8427 15.5546 22.5997 15.4143L16.9998 12.2144C16.7566 12.0739 16.4807 12 16.1998 12C15.919 12 15.6431 12.0739 15.3999 12.2144L9.79999 15.4143C9.55701 15.5546 9 16 9 16.5L9.00001 20.5V23.1981C9.0003 23.4787 9.07436 23.7542 9.21477 23.9971C9.35518 24.24 9.55701 24.4418 9.79999 24.5821L15.3999 27.782C15.6431 27.9224 15.919 27.9963 16.1998 27.9963Z"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1997 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23.1677 15.9985L16.1999 19.9984L9.23207 15.9985"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.001 11.8061V9.76617C16.001 8.98888 16.8489 8.50877 17.5155 8.90867L22.4298 11.8572C23.0322 12.2186 23.4008 12.8697 23.4008 13.5722V16.8833"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  // frame 3
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.00001 20.5V23.1981C9.0003 23.4787 9.07436 23.7542 9.21477 23.9971C9.35518 24.24 9.55701 24.4418 9.79999 24.5821L15.3999 27.782C15.6431 27.9224 15.919 27.9963 16.1998 27.9963C16.4807 27.9963 16.7566 27.9224 16.9998 27.782L22.5997 24.5821C22.8427 24.4418 23.0445 24.24 23.1849 23.9971C23.3253 23.7542 23.3994 23.4787 23.3997 23.1981V16.7982C23.3994 16.5177 23.3253 16.2421 23.1849 15.9992C23.0445 15.7563 22.8427 15.5546 22.5997 15.4143L16.9998 12.2144C16.7566 12.0739 16.4807 12 16.1998 12C15.919 12 15.6431 12.0739 15.3999 12.2144"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.2 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23.1677 15.9985L16.1999 19.9984L9.23207 15.9985"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.7998 13.8145L16.0143 16"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.5002 19.7472L24.1167 15.3498C24.385 15.1982 24.6081 14.978 24.7634 14.7118C24.9187 14.4456 25.0005 14.143 25.0005 13.8348C25.0005 13.5266 24.9187 13.224 24.7634 12.9578C24.6081 12.6916 24.385 12.4715 24.1167 12.3198L20.3291 10.1915C20.1045 10.0659 19.8515 10 19.5941 10C19.3368 10 19.0837 10.0659 18.8591 10.1915L12.5487 13.8348"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.00024 20.8833V13.7662C9.00024 12.9889 9.84821 12.5088 10.5147 12.9087L15.2265 15.7357C15.8289 16.0971 16.1975 16.7481 16.1975 17.4507V20.7618"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  // frame 4
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.79998 15.4143L15.3998 12.2144C15.6431 12.0739 15.919 12 16.1998 12C16.4807 12 16.7566 12.0739 16.9998 12.2144L22.5997 15.4143C22.8427 15.5546 23.0445 15.7563 23.1849 15.9992C23.3253 16.2421 23.3994 16.5177 23.3996 16.7982V23.1981C23.3994 23.4787 23.3253 23.7542 23.1849 23.9971C23.0445 24.24 22.8427 24.4418 22.5997 24.5821L16.9998 27.782C16.7566 27.9224 16.4807 27.9963 16.1998 27.9963C15.919 27.9963 15.6431 27.9224 15.3998 27.782L9.79998 24.5821C9.557 24.4418 9.35518 24.24 9.21476 23.9971C9.07435 23.7542 9.00029 23.4787 9 23.1981V19.9982"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1997 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.23193 15.9985L16.1998 19.9984L23.1676 15.9985"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.0996 14L12.5997 17.7527"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8589 10.0099C19.0835 9.8843 19.3365 9.81836 19.5939 9.81836C19.8512 9.81836 20.1042 9.8843 20.3289 10.0099L24.1165 12.1381C24.3847 12.2898 24.6079 12.51 24.7632 12.7762C24.9185 13.0424 25.0003 13.345 25.0003 13.6532C25.0003 13.9613 24.9185 14.264 24.7632 14.5301C24.6079 14.7963 24.3847 15.0165 24.1165 15.1682L13.1324 21.3546C12.9071 21.4831 12.6522 21.5506 12.3929 21.5506C12.1335 21.5506 11.8787 21.4831 11.6534 21.3546L7.88378 19.2263C7.61553 19.0746 7.39237 18.8544 7.23709 18.5883C7.08182 18.3221 7 18.0194 7 17.7113C7 17.4031 7.08182 17.1005 7.23709 16.8343C7.39237 16.5681 7.61553 16.3479 7.88378 16.1963L18.8589 10.0099Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.2463 11.1364L16.2179 8.7419C16.2087 7.96996 15.3654 7.49911 14.7034 7.89629L9.98488 10.7274C9.37494 11.0933 9.00526 11.7557 9.01401 12.467L9.04907 15.3181"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  // frame 5
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M23.1849 15.9993C23.3253 16.2422 23.3994 16.5177 23.3996 16.7983V23.1982C23.3994 23.4787 23.3253 23.7543 23.1849 23.9972C23.0445 24.2401 22.8427 24.4418 22.5997 24.5821L16.9998 27.782C16.7566 27.9225 16.4807 27.9964 16.1998 27.9964C15.919 27.9964 15.6431 27.9225 15.3998 27.782L9.79998 24.5821C9.557 24.4418 9.35518 24.2401 9.21476 23.9972C9.07435 23.7543 9.00029 23.4787 9 23.1982V20.5001"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1997 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8589 10.2045C19.0835 10.0789 19.3365 10.0129 19.5939 10.0129C19.8512 10.0129 20.1042 10.0789 20.3289 10.2045L24.1165 12.3327C24.3847 12.4844 24.6079 12.7046 24.7632 12.9708C24.9185 13.2369 25.0003 13.5396 25.0003 13.8477C25.0003 14.1559 24.9185 14.4585 24.7632 14.7247C24.6079 14.9909 24.3847 15.2111 24.1165 15.3628L13.1324 21.5491C12.9071 21.6776 12.6522 21.7452 12.3929 21.7452C12.1335 21.7452 11.8787 21.6776 11.6534 21.5491L7.88378 19.4209C7.61553 19.2692 7.39237 19.049 7.23709 18.7828C7.08182 18.5167 7 18.214 7 17.9059C7 17.5977 7.08182 17.2951 7.23709 17.0289C7.39237 16.7627 7.61553 16.5425 7.88378 16.3908L18.8589 10.2045Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8649 13.5L13.1414 10.1956C12.9176 10.0674 12.6642 10 12.4064 10C12.1485 10 11.8952 10.0674 11.6714 10.1956L7.88378 12.3328C7.61553 12.4845 7.39237 12.7047 7.23709 12.9709C7.08182 13.2371 7 13.5397 7 13.8479C7 14.156 7.08182 14.4587 7.23709 14.7248C7.39237 14.991 7.61553 15.2112 7.88378 15.3629L16 20"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M23.1972 15.5L23.1972 12.7662C23.1972 11.9889 22.3493 11.5088 21.6827 11.9087L16.971 14.7357C16.3686 15.0971 16 15.7482 16 16.4507L16.0001 19.5"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
  // frame 6
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M23.3996 20V23.1982C23.3994 23.4788 23.3253 23.7543 23.1849 23.9972C23.0445 24.2401 22.8427 24.4419 22.5997 24.5821L16.9998 27.7821C16.7566 27.9225 16.4807 27.9964 16.1998 27.9964C15.919 27.9964 15.6431 27.9225 15.3998 27.7821L9.79998 24.5821C9.557 24.4419 9.35518 24.2401 9.21476 23.9972C9.07435 23.7543 9.00029 23.4788 9 23.1982V20.5001"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1997 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8589 10.2045C19.0835 10.0789 19.3365 10.0129 19.5939 10.0129C19.8512 10.0129 20.1042 10.0789 20.3289 10.2045L24.1165 12.3327C24.3847 12.4844 24.6079 12.7046 24.7632 12.9708C24.9185 13.2369 25.0003 13.5396 25.0003 13.8477C25.0003 14.1559 24.9185 14.4585 24.7632 14.7247C24.6079 14.9909 24.3847 15.2111 24.1165 15.3628L13.1324 21.5491C12.9071 21.6776 12.6522 21.7452 12.3929 21.7452C12.1335 21.7452 11.8787 21.6776 11.6534 21.5491L7.88378 19.4209C7.61553 19.2692 7.39237 19.049 7.23709 18.7828C7.08182 18.5167 7 18.214 7 17.9059C7 17.5977 7.08182 17.2951 7.23709 17.0289C7.39237 16.7627 7.61553 16.5425 7.88378 16.3908L18.8589 10.2045Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.1162 19.4209C24.3845 19.2693 24.6076 19.0491 24.7629 18.7829C24.9182 18.5167 25 18.2141 25 17.9059C25 17.5978 24.9182 17.2951 24.7629 17.029C24.6076 16.7628 24.3845 16.5426 24.1162 16.3909L13.1413 10.1955C12.9175 10.0674 12.6642 10 12.4063 10C12.1485 10 11.8951 10.0674 11.6713 10.1955L7.88377 12.3328C7.61552 12.4845 7.39236 12.7047 7.23709 12.9709C7.08182 13.237 7 13.5397 7 13.8478C7 14.156 7.08182 14.4586 7.23709 14.7248C7.39236 14.991 7.61552 15.2112 7.88377 15.3629L18.8677 21.5492C19.0914 21.6777 19.3448 21.7453 19.6027 21.7453C19.8606 21.7453 20.114 21.6777 20.3377 21.5492L24.1162 19.4209Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  // frame 7
  (color: string) => (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M23.3996 20V23.1982C23.3994 23.4788 23.3253 23.7543 23.1849 23.9972C23.0445 24.2401 22.8427 24.4419 22.5997 24.5821L16.9998 27.7821C16.7566 27.9225 16.4807 27.9964 16.1998 27.9964C15.919 27.9964 15.6431 27.9225 15.3998 27.7821L9.79998 24.5821C9.557 24.4419 9.35518 24.2401 9.21476 23.9972C9.07435 23.7543 9.00029 23.4788 9 23.1982V20.5001"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1997 27.9979V19.998"
        stroke={color}
        strokeWidth="1.59996"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.8589 10.2045C19.0835 10.0789 19.3365 10.0129 19.5939 10.0129C19.8512 10.0129 20.1042 10.0789 20.3289 10.2045L24.1165 12.3327C24.3847 12.4844 24.6079 12.7046 24.7632 12.9708C24.9185 13.2369 25.0003 13.5396 25.0003 13.8477C25.0003 14.1559 24.9185 14.4585 24.7632 14.7247C24.6079 14.9909 24.3847 15.2111 24.1165 15.3628L13.1324 21.5491C12.9071 21.6776 12.6522 21.7452 12.3929 21.7452C12.1335 21.7452 11.8787 21.6776 11.6534 21.5491L7.88378 19.4209C7.61553 19.2692 7.39237 19.049 7.23709 18.7828C7.08182 18.5167 7 18.214 7 17.9059C7 17.5977 7.08182 17.2951 7.23709 17.0289C7.39237 16.7627 7.61553 16.5425 7.88378 16.3908L18.8589 10.2045Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M24.1162 19.4209C24.3845 19.2693 24.6076 19.0491 24.7629 18.7829C24.9182 18.5167 25 18.2141 25 17.9059C25 17.5978 24.9182 17.2951 24.7629 17.029C24.6076 16.7628 24.3845 16.5426 24.1162 16.3909L13.1413 10.1955C12.9175 10.0674 12.6642 10 12.4063 10C12.1485 10 11.8951 10.0674 11.6713 10.1955L7.88377 12.3328C7.61552 12.4845 7.39236 12.7047 7.23709 12.9709C7.08182 13.237 7 13.5397 7 13.8478C7 14.156 7.08182 14.4586 7.23709 14.7248C7.39236 14.991 7.61552 15.2112 7.88377 15.3629L18.8677 21.5492C19.0914 21.6777 19.3448 21.7453 19.6027 21.7453C19.8606 21.7453 20.114 21.6777 20.3377 21.5492L24.1162 19.4209Z"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 7V4"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M19 8L21 7"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M13 8L11 7"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  ),
];

export interface PackageAnimationProps {
  readonly animate?: boolean;
  readonly loop?: boolean;
  readonly color?: string;
  readonly size?: number;
  readonly onComplete?: () => void;
}

export function PackageAnimation({
  animate = false,
  loop = false,
  color = "currentColor",
  size = 32,
  onComplete,
}: PackageAnimationProps) {
  const [frameIndex, setFrameIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isRunning = useRef(false);

  useEffect(() => {
    if (!animate || isRunning.current) return;

    isRunning.current = true;
    setFrameIndex(0);

    let current = 0;
    const totalFrames = frames.length;

    const tick = () => {
      current += 1;
      if (current < totalFrames - 1) {
        setFrameIndex(current);
        timerRef.current = setTimeout(tick, FRAME_DURATION);
      } else {
        setFrameIndex(totalFrames - 1);
        timerRef.current = setTimeout(() => {
          if (loop) {
            current = 0;
            setFrameIndex(0);
            timerRef.current = setTimeout(tick, FRAME_DURATION);
          } else {
            isRunning.current = false;
            onComplete?.();
          }
        }, HOLD_LAST_FRAME);
      }
    };

    timerRef.current = setTimeout(tick, FRAME_DURATION);
    return () => {
      isRunning.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [animate, loop]);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          transform: `scale(${size / 32})`,
          transformOrigin: "center",
          display: "block",
          width: 32,
          height: 32,
        }}
      >
        {frames[frameIndex](color)}
      </span>
    </span>
  );
}
