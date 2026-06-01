interface SwitchboardLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  target?: string;
  onClick?: () => void;
}

export default function SwitchboardLink({
  href,
  className,
  children,
  target,
  onClick,
}: SwitchboardLinkProps) {
  return (
    <a
      className={
        className
          ? className
          : "text-gray-800 hover:text-orange-500 dark:text-slate-50 dark:hover:text-orange-100"
      }
      href={href}
      target={target ?? "_self"}
      onClick={onClick ?? (() => {})}
    >
      {children}
    </a>
  );
}
