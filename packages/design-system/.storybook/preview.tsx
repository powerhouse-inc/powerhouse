import { withThemeByDataAttribute } from "@storybook/addon-themes";
import type { Preview, ReactRenderer } from "@storybook/react";
import "../src/globals.css";

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    options: {
      storySort: {
        order: [
          "Connect",
          "Powerhouse",
          "RWA",
          "Document Engineering", 
          ["Simple Components", "Complex Components", "Layout Components", "Fragments"],
        ],
        method: "alphabetical",
        includeNames: true,
      },
    },
  },
  decorators: [
    withThemeByDataAttribute<ReactRenderer>({
      themes: {
        light: "light",
        dark: "dark",
      },
      defaultTheme: "light",
      attributeName: 'data-mode',
    }),
  ],
};

export default preview;
