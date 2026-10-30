/**
 * Lists the app's drives again: `app-reactor-client` registers how when it
 * loads, which boot does before anything can ask.
 *
 * The backend auth gate calls through here rather than importing the client:
 * the client reaches the runtime config, which loads the plugin UI and with
 * it core's views, and the gate is one of those views.
 */
let relist: (() => Promise<void>) | undefined;

export function setDriveRelister(fn: () => Promise<void>): void {
  relist = fn;
}

/** Nothing to do before the client registered: boot lists the drives itself. */
export function relistDrives(): Promise<void> {
  return relist ? relist() : Promise.resolve();
}
