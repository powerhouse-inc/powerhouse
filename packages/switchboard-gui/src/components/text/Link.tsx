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
      className={className ? className : "text-foreground hover:hover-effect"}
      href={href}
      target={target ?? "_self"}
      onClick={onClick ?? (() => {})}
    >
      {children}
    </a>
  );
}
