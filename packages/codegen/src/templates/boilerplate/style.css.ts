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
  /* static: the page keeps these tokens even unused, as packages' classes read them. */
  @theme static {
    /* Override Connect's theme variables here, e.g. --color-primary. */
    /* See https://tailwindcss.com/docs/theme#using-a-custom-theme for details */
  }
`.raw;
