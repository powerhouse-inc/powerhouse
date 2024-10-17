import Link from "next/link";
import React from "react";

interface SwitchboardLinkProps {
    href: string;
    children: React.ReactNode;
    className?: string;
}

export default function SwitchboardLink({ href, className, children }: SwitchboardLinkProps) {
    return (
        <Link className={className ? className : "text-black hover:text-orange-500"} href={href}>
            {children}
        </Link>
    );
}
