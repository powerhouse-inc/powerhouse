import { createAction, Property } from "@powerhousedao/pieces-framework";

// Stamped into every result: the file URL of the bundle this action ran from,
// which is how the e2e proves the reactor loaded the installed copy.
const MODULE_URL = import.meta.url;

export const greetAction = createAction({
  name: "greet",
  displayName: "Greet",
  description: "Upper-cases a name and reports the module it ran from.",
  requireAuth: false,
  props: {
    who: Property.ShortText({
      displayName: "Who",
      description: "The name to greet.",
      required: true,
    }),
  },
  // Deterministic and offline: no network, no clock, no credentials, so the
  // e2e can assert the run output exactly.
  run: (ctx) => {
    const who = String(ctx.propsValue.who ?? "");
    return Promise.resolve({
      greeting: `Hello, ${who.toUpperCase()}!`,
      length: who.length,
      moduleUrl: MODULE_URL,
    });
  },
});
