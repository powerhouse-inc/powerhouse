import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export const pieceLogoFileTemplate = (v: PieceNames) =>
  ts`
// The piece's icon in Studio. Any image URL works, e.g. "https://acme.com/logo.png";
// this placeholder is an inline SVG of the piece's initials.
export const ${v.constantCaseName}_LOGO =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">' +
      '<rect width="48" height="48" rx="10" fill="#1f2937"/>' +
      '<text x="24" y="31" font-family="system-ui, sans-serif" font-size="18" ' +
      'font-weight="600" fill="#f9fafb" text-anchor="middle">${v.displayName.slice(0, 2).toUpperCase()}</text>' +
      "</svg>",
  );
`.raw;
