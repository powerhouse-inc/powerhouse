const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];
export const useTheme = () => 'light' as Theme;

export function isTheme(theme: string): theme is Theme {
    return THEMES.includes(theme as Theme);
}
