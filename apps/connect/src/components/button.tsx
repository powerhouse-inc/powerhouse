import { twMerge } from "tailwind-merge";

const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({
  className,
  ...props
}) => {
  return (
    <button
      className={twMerge(
        "rounded-md bg-muted-foreground/20 px-4 py-1.5 text-muted-foreground shadow-button hover:hover-effect hover:shadow-none",
        className,
      )}
      {...props}
    />
  );
};

export default Button;
