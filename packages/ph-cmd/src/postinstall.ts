import { init } from "./commands/setup-globals.js";

const createGlobalProject = async () => {
  await init(undefined, {});
};

createGlobalProject().catch((err: unknown) => console.error(err));
