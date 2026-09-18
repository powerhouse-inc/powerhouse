// A structural piece: no framework, just the shape the loader duck-types.
import { greet, LOGO } from "./lib/greeting.js";

export const hello = {
  displayName: "Hello",
  logoUrl: LOGO,
  description: "Says hello.",
  authors: ["fixture"],
  categories: ["CORE"],
  auth: undefined,
  minimumSupportedRelease: "0.30.0",
  actions() {
    return {
      say_hello: {
        name: "say_hello",
        displayName: "Say hello",
        description: "",
        requireAuth: false,
        props: {
          who: {
            type: "SHORT_TEXT",
            displayName: "Who",
            required: true,
            options: () => Promise.resolve([]),
          },
        },
        run: async (who: string) => {
          const { shout } = await import("./lazy.js");
          return shout(greet(who));
        },
      },
    };
  },
  triggers() {
    return {};
  },
};
