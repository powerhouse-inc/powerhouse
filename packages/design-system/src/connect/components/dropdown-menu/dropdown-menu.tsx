import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "#powerhouse";
import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type ConnectDropdownMenuItem<TItemId extends string> = {
  id: TItemId;
  label: ReactNode;
  icon?: React.JSX.Element;
  className?: string;
};

export interface ConnectDropdownMenuProps<TItemId extends string> {
  readonly children: ReactNode;
  readonly items: ConnectDropdownMenuItem<TItemId>[];
  readonly open?: boolean;
  readonly onItemClick: (id: TItemId) => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export function ConnectDropdownMenu<TItemId extends string>(
  props: ConnectDropdownMenuProps<TItemId>,
) {
  const { children, items, open, onItemClick, onOpenChange } = props;

  return (
    <DropdownMenu onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger asChild className="outline-none">
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="modal-shadow cursor-pointer rounded-2xl bg-white text-sm font-medium text-slate-500">
        {items.map(({ id, label, icon, className }) => (
          <DropdownMenuItem
            className={twMerge(
              "flex items-center px-5 py-2 outline-none first-of-type:rounded-t-2xl first-of-type:pt-3 last-of-type:rounded-b-2xl last-of-type:pb-3 hover:bg-slate-50",
              className,
            )}
            key={id}
            onClick={(e) => e.stopPropagation()}
            onSelect={() => onItemClick(id)}
          >
            {icon ? <span className="mr-2 inline-block">{icon}</span> : null}
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
