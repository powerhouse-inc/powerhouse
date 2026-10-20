import { css } from "@tmpl/core";

/** The imports `ph migrate` keeps current; the rest of style.css is the project's. */
export const styleImportsTemplate = css`
  /* Package CSS goes in external-packages, between Connect's components and utilities. */
  @layer theme, base, components, external-packages, utilities;
  @import "tailwindcss";
  /* Connect's tokens, rules and classes, generated in this one build. */
  @import "@powerhousedao/connect/tailwind.css";
`.raw;

export const styleTemplate = css`
  ${styleImportsTemplate}

  @theme {
    /* You can customize the theme by overriding the theme variables here */
    /* See https://tailwindcss.com/docs/theme#using-a-custom-theme for details */

    /* If you would prefer to use plain css, add your styles below this @theme tag as you normally would */

    /* A sensible CSS reset is applied by default. If you would prefer to use a different reset or none at all, uncomment the following line */

    /* --*: initial; */
  }
`.raw;
