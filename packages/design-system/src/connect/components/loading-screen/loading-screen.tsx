import type { Size } from "#powerhouse";
import { twMerge } from "tailwind-merge";

import { AnimatedLoader } from "../animated-loader/index.js";

export interface LoadingScreenProps {
  showLoadingScreen: boolean;
  loadingComponent?: React.ReactNode;
  size?: Size;
  className?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = (props) => {
  const { showLoadingScreen, loadingComponent, size, className } = props;

  if (loadingComponent && showLoadingScreen) {
    return loadingComponent;
  }

  return (
    <div
      className={twMerge(
        "absolute inset-0 z-10 flex items-center justify-center bg-white",
        !showLoadingScreen && "hidden",
        className,
      )}
    >
      <AnimatedLoader size={size} />
    </div>
  );
};
