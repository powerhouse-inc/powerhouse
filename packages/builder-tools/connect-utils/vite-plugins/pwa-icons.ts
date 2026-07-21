import { readFileSync } from "node:fs";
import type { Plugin } from "vite";

// PWA manifest icons emitted into the build from the @powerhousedao/connect
// package assets. The `ph connect build` Vite root is a scaffolded project that
// has no PWA icons of its own, so — like connectFaviconPlugin does for the
// favicon — we resolve them out of the installed connect package and emit them
// as build assets. vite-plugin-pwa references these filenames in the generated
// manifest and precaches them via its png glob. The document icons are the
// OS-level file-type icons referenced by the .phd/.phdm file_handlers.
const PWA_ICONS = [
  "pwa-192x192.png",
  "pwa-512x512.png",
  "pwa-512x512-maskable.png",
  "document-icon-192x192.png",
  "document-icon-512x512.png",
] as const;

export function connectPwaIconsPlugin(): Plugin {
  return {
    name: "copy-connect-pwa-icons",
    async generateBundle(_options, bundle) {
      for (const icon of PWA_ICONS) {
        try {
          if (icon in bundle) continue;
          const resolved = await this.resolve(
            `@powerhousedao/connect/assets/${icon}`,
          );
          if (!resolved) continue;
          this.emitFile({
            type: "asset",
            fileName: icon,
            source: readFileSync(resolved.id),
          });
        } catch {
          // connect package or icon not found — skip; the manifest still
          // generates, the icon URL just 404s (non-fatal for offline caching).
        }
      }
    },
  };
}
