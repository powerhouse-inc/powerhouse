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
      className={className ? className : "text-black hover:text-orange-500"}
      href={href}
      target={target ?? "_self"}
      onClick={onClick ?? (() => {})}
    >
      {children}
    </a>
  );
}
