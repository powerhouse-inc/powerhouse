import { bootConnect } from "./src/boot.js";

// Paint the config-independent skeleton, start the runtime config fetch
// alongside it, and wait for the config. See src/boot.tsx for why the two
// overlap and what a failure renders.
const root = await bootConnect();

// `null` means startup failed and the error state is already painted. The app
// graph must not be imported then: its modules read the runtime config at
// module-evaluation and would throw.
if (root) {
  const { AppLoader } = await import("./src/components/app-loader.js");
  root.render(<AppLoader />);
}
