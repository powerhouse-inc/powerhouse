/** Fixture runners mirror their real runner's CONTRACT (kind, verbs, host
 * schemas, outputsSchema) for the host-fixture pipeline test, which starts
 * nothing: every verb throws. */
export function neverLaunched(specifier: string) {
  return (): Promise<never> =>
    Promise.reject(
      new Error(
        `${specifier} is a fixture runner; the fixture test never launches it.`,
      ),
    );
}
