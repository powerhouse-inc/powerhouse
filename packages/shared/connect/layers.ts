/** Connect's cascade layers, Tailwind's `properties` first: package CSS goes in
 * external-packages, above Connect's reset and below its utilities. */
export const CONNECT_LAYER_ORDER =
  "@layer properties, theme, base, components, external-packages, utilities;";
