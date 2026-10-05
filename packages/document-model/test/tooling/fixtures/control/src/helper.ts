/**
 * A reducer helper, imported by the definition root but invisible to every
 * definition digest. Editing it changes what the package does and nothing the
 * structured definition records, which is exactly the case a revision has to
 * catch and a digest cannot.
 */
export function normalizeTitle(title: string): string {
  return title.trim();
}
