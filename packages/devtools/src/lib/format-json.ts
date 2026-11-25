/** JSON text laid out two spaces per level. Text that is not JSON stays as
 * written. */
export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
