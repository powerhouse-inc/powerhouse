export const NPM_NAME_RE =
  /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$|^[a-z0-9][a-z0-9._-]*$/i;

export function isPlausiblePackageName(name: string): boolean {
  return name.length >= 2 && NPM_NAME_RE.test(name);
}
