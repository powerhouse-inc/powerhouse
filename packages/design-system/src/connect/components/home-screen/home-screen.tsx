import { twMerge } from "tailwind-merge";
type HomeScreenProps = {
  readonly children: React.ReactNode;
  readonly containerClassName?: string;
};
export const HomeScreen = function HomeScreen(props: HomeScreenProps) {
  const { children, containerClassName } = props;
  return (
    <div>
      <div
        className={twMerge(
          "container flex h-screen flex-wrap justify-center gap-4 bg-[url(/home-bg.png)] bg-cover bg-center p-8 text-gray-800 placeholder:text-gray-500",
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
};
