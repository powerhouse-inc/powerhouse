// A piece with a metadata() method, the way the framework's Piece class has one.
import { greet, LOGO } from "../hello/lib/greeting.js";

const actions = {
  say_hello: {
    name: "say_hello",
    displayName: "Say goodbye",
    description: "Waves goodbye.",
    requireAuth: false,
    props: {
      who: {
        type: "SHORT_TEXT",
        displayName: "Who",
        required: true,
        options: () => Promise.resolve([]),
      },
    },
    run: (who: string) => Promise.resolve(greet(who).replace("hello", "bye")),
  },
};

export const goodbye = {
  displayName: "Goodbye",
  logoUrl: LOGO,
  description: "Says goodbye.",
  authors: ["fixture"],
  categories: ["CORE"],
  auth: undefined,
  minimumSupportedRelease: "0.30.0",
  actions() {
    return actions;
  },
  triggers() {
    return {};
  },
  metadata() {
    return {
      displayName: this.displayName,
      logoUrl: this.logoUrl,
      description: this.description,
      authors: this.authors,
      categories: this.categories,
      auth: this.auth,
      minimumSupportedRelease: this.minimumSupportedRelease,
      maximumSupportedRelease: undefined,
      deprecated: false,
      actions,
      triggers: {},
      contextInfo: undefined,
    };
  },
};
