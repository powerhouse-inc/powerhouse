import { twMerge } from "tailwind-merge";

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  ...props
}) => {
  return (
    <button
      className={twMerge(
        "rounded-md bg-gray-500/20 px-4 py-1.5 text-gray-500 shadow-button hover-hover hover:shadow-none dark:text-slate-400",
        className,
      )}
      {...props}
    />
  );
};

export default Button;
