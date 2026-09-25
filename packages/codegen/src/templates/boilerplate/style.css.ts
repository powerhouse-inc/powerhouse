import { css } from "@tmpl/core";

export const styleTemplate = css`
  /* This package's styles: installs load them inside Connect, which already
     provides its reset and its own UI styles, so only tokens and utilities. */
  @import "tailwindcss/theme.css" layer(theme);
  @import "@powerhousedao/design-system/theme.css";
  @import "tailwindcss/utilities.css" layer(utilities);

  @theme {
    /* Customize this package's theme variables here. */
    /* See https://tailwindcss.com/docs/theme#using-a-custom-theme */
  }
`.raw;
