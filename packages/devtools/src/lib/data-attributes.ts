/** `data-*` attributes a component passes on to its root element: test ids,
 * and state that styles and tests read. */
export type DataAttributes = { [k: `data-${string}`]: string | undefined };
