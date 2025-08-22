/** Allows using forward ref with generics.
 * @see: https://www.totaltypescript.com/forwardref-with-generic-components
 */

import React from "react";
export function fixedForwardRef<T, P = {}>(
  render: (props: P, ref: React.Ref<T>) => React.ReactNode,
): (props: P & React.RefAttributes<T>) => React.ReactNode {
  // @ts-expect-error - This is a hack to make the types work
  return React.forwardRef(render) as any;
}
