import { twMerge } from "tailwind-merge";
import { LogoAnimation } from "../logo-animation.js";

export interface LoadingScreenProps {
  showLoadingScreen: boolean;
  loadingComponent?: React.ReactNode;
  size?: number;
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
        "absolute inset-0 z-10 flex items-center justify-center bg-white dark:bg-slate-900",
        !showLoadingScreen && "hidden",
        className,
      )}
    >
      <LogoAnimation size={size} />
    </div>
  );
};
