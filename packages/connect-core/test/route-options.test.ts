// Every core route file exports `options` typed as the route's options, so an
// override reads any of them, set or not. tsc checks the types below.

import { describe, expect, expectTypeOf, it } from "vitest";
import * as root from "../src/routes/__root.js";
import * as app from "../src/routes/_app.js";
import * as notFound from "../src/routes/_app/$.js";
import * as drive from "../src/routes/_app/d/$driveSlug.js";
import * as node from "../src/routes/_app/d/$driveSlug/{-$nodeSlug}.js";
import * as home from "../src/routes/_app/index.js";
import * as settings from "../src/routes/_app/settings.js";
import * as appearance from "../src/routes/_app/settings/appearance.js";
import * as packages from "../src/routes/_app/settings/packages.js";

const routes = {
  root,
  app,
  notFound,
  drive,
  node,
  home,
  settings,
  appearance,
  packages,
};

describe("core route options", () => {
  it("name every route option, the unset ones too", () => {
    expectTypeOf(home.options).toHaveProperty("loader");
    expectTypeOf(home.options).toHaveProperty("validateSearch");
    expectTypeOf(home.options).toHaveProperty("beforeLoad");
    expectTypeOf(app.options).toHaveProperty("staticData");
    expectTypeOf(appearance.options).toHaveProperty("loader");
    expectTypeOf(home.options.loader).toEqualTypeOf<undefined>();
    // What a route sets keeps its own type.
    expectTypeOf(drive.options.pendingMinMs).toEqualTypeOf<number>();
    expectTypeOf(node.options.validateSearch).toBeFunction();
  });

  it("are what each route is made with", () => {
    for (const [name, { options, Route }] of Object.entries(routes)) {
      for (const [key, value] of Object.entries(options)) {
        expect(
          (Route.options as unknown as Record<string, unknown>)[key],
          `${name}.${key}`,
        ).toBe(value);
      }
    }
  });
});
