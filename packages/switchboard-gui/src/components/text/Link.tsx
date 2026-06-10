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
        className ? className : "text-gray-900 hover:effect dark:text-slate-50"
      }
      href={href}
      target={target ?? "_self"}
      onClick={onClick ?? (() => {})}
    >
      {children}
    </a>
  );
}
