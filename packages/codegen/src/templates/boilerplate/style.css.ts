import { STYLE_IMPORT_LINES } from "@powerhousedao/shared/clis/package-style";
import { css } from "@tmpl/core";

/** The imports `ph migrate` keeps current; the rest of style.css is the project's. */
export const styleImportsTemplate = `\n${STYLE_IMPORT_LINES.join("\n")}\n`;

export const styleTemplate = css`
  ${styleImportsTemplate}

  /* The package's own tokens and rules, for its editors and routes: ph build
     ships them in the package's stylesheet. Theme Connect in hosts/connect/style.css. */
`.raw;

/** hosts/connect/style.css: this Connect's theme, which packages don't ship. */
export const hostStyleTemplate = css`
  /* This Connect's theme: token values and global rules. The page's Tailwind build
     adds it after style.css; ph build leaves it out of the package's stylesheet. */
  /* Colours: a semantic token (--primary, --background, ...) takes a light value
     on :root and a dark one on :root.dark; on :root alone it wins in dark mode too. */
  :root {
  }
  :root.dark {
  }
  /* static: the page keeps these tokens even unused, as packages' classes read them. */
  @theme static {
    /* Other theme values, e.g. --font-sans: https://tailwindcss.com/docs/theme */
  }
`.raw;
