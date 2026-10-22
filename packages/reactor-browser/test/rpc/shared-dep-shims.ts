const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Module URLs that re-export this realm's copies, as Connect's dev shims re-export the page's. */
export function shimSharedDeps(
  deps: Record<string, Record<string, unknown>>,
): Record<string, string> {
  const global = globalThis as { __sharedDeps?: typeof deps };
  global.__sharedDeps = { ...global.__sharedDeps, ...deps };
  return Object.fromEntries(
    Object.entries(deps).map(([specifier, namespace]) => {
      const names = Object.keys(namespace).filter(
        (name) => name !== "default" && IDENTIFIER.test(name),
      );
      // Aliased, since an export such as zod's `catch` can't be a binding name.
      const source = [
        `const m = globalThis.__sharedDeps[${JSON.stringify(specifier)}];`,
        ...names.map((name, i) => `const _${i} = m.${name};`),
        `export { ${names.map((name, i) => `_${i} as ${name}`).join(", ")} };`,
      ].join("\n");
      const blob = new Blob([source], { type: "text/javascript" });
      return [specifier, URL.createObjectURL(blob)];
    }),
  );
}
