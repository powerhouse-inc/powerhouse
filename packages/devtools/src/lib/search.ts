/** Whether any of the texts contains the search, ignoring case and the
 * search's surrounding spaces. */
export const includesSearch = (texts: readonly string[], search: string) => {
  const needle = search.trim().toLowerCase();
  return texts.some((text) => text.toLowerCase().includes(needle));
};
