/** Allows using forward ref with generics.
 * @see: https://www.totaltypescript.com/forwardref-with-generic-components
 */

export function fixedForwardRef<T, P = {}>(
  render: (props: P, ref: React.Ref<T>) => React.ReactNode,
): (props: P & React.RefAttributes<T>) => React.ReactNode {
  // @ts-expect-error - This is a hack to make the types work
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return React.forwardRef(render) as any;
}
