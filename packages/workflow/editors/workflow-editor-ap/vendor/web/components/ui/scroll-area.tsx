// ph-replacement: upstream wraps @radix-ui/react-scroll-area (not in the
// workspace); plain overflow containers keep the same component surface.
import * as React from 'react';

import { cn } from '../../lib/utils.js';

const ScrollArea = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    viewPortClassName?: string;
    viewPortRef?: React.Ref<HTMLDivElement>;
  }
>(({ className, children, viewPortClassName, viewPortRef, ...props }, ref) => (
  <div ref={ref} className={cn('relative overflow-auto', className)} {...props}>
    <div ref={viewPortRef} className={cn('h-full w-full', viewPortClassName)}>
      {children}
    </div>
  </div>
));
ScrollArea.displayName = 'ScrollArea';

const ScrollBar = (_props: {
  orientation?: 'vertical' | 'horizontal';
  className?: string;
}) => null;

export { ScrollArea, ScrollBar };
