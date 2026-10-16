import { html } from "@tmpl/core";

export const legacyIndexHtmlTemplate = html`
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta
        name="description"
        content="Connect is a hub for your most important documents and processes, translated into software. Easily capture data in a structured way with dedicated business process packages. Collaborate on shared documents with ease while using your preferred storage solution (decentralized, centralized, or local)."
      />
      <title>Powerhouse Connect</title>
      <link rel="icon" href="/icon.ico" />
      <style>
        @import "tailwindcss";
        @import "@powerhousedao/design-system/style.css";
        @import "@powerhousedao/document-engineering/style.css";
        @source "./node_modules/@powerhousedao/connect";
      </style>
    </head>
    <body>
      <div id="root"></div>
      <script type="module">
        // initializes Connect on '<div id="root"></div>'
        import "@powerhousedao/connect/main.js";
      </script>
    </body>
  </html>
`.raw;
