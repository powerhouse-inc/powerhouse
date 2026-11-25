// @ts-check
// The connect host, built into and served from its own folder: the preview
// specs' Connect must not share `dist/` with the package build (`ph build`).
import connect from "../connect/host.js";

export default /** @satisfies {PHHost} */ ({
  ...connect,
  runner: { ...connect.runner, outDir: "dist-connect" },
});
