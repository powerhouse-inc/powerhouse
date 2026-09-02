// Shim for i18next/react-i18next: identity translation with {{var}} interpolation.
import type { ReactNode } from "react";

export function t(key: string, vars?: Record<string, unknown>): string {
  if (!vars) return key;
  return key.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value as string | number);
  });
}

export const i18n = {
  language: "en",
  changeLanguage: (_locale: string): Promise<void> => Promise.resolve(),
};

export function useTranslation(): { t: typeof t; i18n: typeof i18n } {
  return { t, i18n };
}

export function Trans(props: { children?: ReactNode }): ReactNode {
  return props.children ?? null;
}

export default { t };
