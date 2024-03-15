import { CSSProperties } from 'react';

type ColorTheme = 'light' | 'dark';

const colorScheme = {
    light: {
        color: '#222222',
        bgColor: '#FFFFFF',
        border: '#EEEEEE',
        shadow: 'rgba(128,128,128,0.65)',
        inputColor: '#222222',
        inputBg: '#F6F6F6',
    },
    dark: {
        color: '#CCCCCC',
        bgColor: '#0A0A0A',
        border: '#181818',
        shadow: 'rgba(255, 255, 255, 0.25)',
        inputColor: '#CCCCCC',
        inputBg: '#1A1D1F',
    },
};

type TypographySize =
    | 'chapter'
    | 'huge'
    | 'larger'
    | 'large'
    | 'medium'
    | 'small'
    | 'smaller'
    | 'tiny';
type TypographyScheme = { [K in TypographySize]: CSSProperties };

const typographySizes: TypographyScheme = {
    chapter: {
        fontSize: '64pt',
        fontWeight: 'bold',
        padding: '6pt 24pt',
        margin: '0',
        lineHeight: 1,
        textAlign: 'right',
        borderLeft: '4px solid',
    },
    huge: {
        fontSize: '32pt',
        fontWeight: 'normal',
        padding: '6pt',
        margin: '0 0 0 -6pt',
        lineHeight: 1,
    },
    larger: {
        fontSize: '24pt',
        fontWeight: 'bold',
        padding: '6pt',
        margin: '-12pt 0 0 0',
    },
    large: {
        fontSize: '18pt',
        fontWeight: 'bold',
        padding: '6pt',
        margin: '-10.5pt 0 0 0',
    },
    medium: {
        fontSize: '11pt',
        fontWeight: 'bold',
        padding: '6pt',
        margin: '-8pt 0 0 0',
    },
    small: {
        fontSize: '10pt',
        fontWeight: 'normal',
        padding: '6pt',
        margin: '-6pt 0 0 0',
    },
    smaller: {
        fontSize: '9pt',
        fontWeight: 'normal',
        padding: '6pt',
        margin: '-5pt 0 0 0',
    },
    tiny: {
        fontSize: '8pt',
        fontWeight: 'normal',
        padding: '6pt',
        margin: '-8pt 0 0 0',
    },
};

const inputStyle = (
    mode: keyof typeof colorScheme = 'light',
    focus = false,
) => {
    const scheme = colorScheme[mode];

    return {
        width: '100%',
        border: 'none',
        boxSizing: 'border-box',
        backgroundColor: focus ? scheme.inputBg : scheme.bgColor,
        outline: 'none',
        color: scheme.inputColor,
        resize: 'none',
        fontFamily: 'Roboto, sans-serif',
        overflow: 'hidden',
        lineHeight: '1.5',
    } satisfies CSSProperties;
};

export type { ColorTheme, TypographyScheme, TypographySize };
export { colorScheme, inputStyle, typographySizes };
