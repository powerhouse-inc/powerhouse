/// <reference lib="dom" />
import { consoleLogin, RenownBuilder } from "@renown/sdk";
import type { IRenown, PowerhouseVerifiableCredential } from "@renown/sdk";

/**
 * The page the desktop shell opens before anything runs: it finds out who is
 * using the app, then asks the shell to start the stack for that identity.
 *
 * The shell serves it from Connect's own origin, so it shares Connect's session
 * key and session: once the stack is up, Connect is already signed in.
 */

type Identity = {
  kind: "renown" | "local";
  id: string;
  address: string;
  name: string | null;
  image: string | null;
};

type DesktopState = {
  appName: string;
  root: string;
  rootLocked: boolean;
  rootMissing: boolean;
  syncedFolder: string | null;
  identities: Identity[];
  hasLocalKey: boolean;
  oldData: boolean;
  settingsError: string | null;
  renownUrl: string;
  renownSwitchboardUrl: string | null;
  chainId: number;
};

type Unlocked = { credential: PowerhouseVerifiableCredential };

declare global {
  interface Window {
    __TAURI_INTERNALS__: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
    phDesktop: { openExternal(url: string): Promise<void> };
    /** Called by the shell when a stack it started didn't come up. */
    phDesktopStartFailed?: (message: string) => void;
  }
}

/** Connect's own: `RenownBuilder("connect", { basename })` in its store. */
const APP_NAME = "connect";
const BASENAME = "/";
const PASSWORD_LENGTH = 8;

const page = document.getElementById("sign-in") as HTMLElement;
let state: DesktopState;
let notice: string | null = null;
let renownReady: Promise<IRenown> | undefined;

const invoke = <T>(command: string, args?: Record<string, unknown>) =>
  window.__TAURI_INTERNALS__.invoke<T>(command, args);

const message = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

function show(html: string): void {
  const banner = notice
    ? `<p class="notice" role="alert">${esc(notice)}</p>`
    : "";
  notice = null;
  page.innerHTML = banner + html;
  page.querySelector<HTMLElement>("[autofocus]")?.focus();
}

function on(id: string, handler: () => void | Promise<void>): void {
  document.getElementById(id)?.addEventListener("click", () => {
    void Promise.resolve(handler()).catch(fail);
  });
}

function fail(error: unknown): void {
  notice = message(error);
  void home();
}

function renown(): Promise<IRenown> {
  renownReady ??= new RenownBuilder(APP_NAME, {
    basename: BASENAME,
    baseUrl: state.renownUrl,
    switchboardUrl: state.renownSwitchboardUrl ?? undefined,
    chainId: state.chainId,
    revalidate: "never",
  }).build();
  return renownReady;
}

/* ------------------------------------------------------------ the first page */

async function home(): Promise<void> {
  state = await invoke<DesktopState>("desktop_state");
  document.title = state.appName;
  if (state.rootMissing) return folderMissing();
  if (state.settingsError) return settingsBroken();

  const rows = state.identities.map(identityRow).join("");
  show(`
    <h1>${state.identities.length ? `Who's using ${esc(state.appName)}?` : `Welcome to ${esc(state.appName)}`}</h1>
    ${rows ? `<ul class="identities">${rows}</ul>` : ""}
    <button class="primary" id="renown" autofocus>Sign in with Renown</button>
    <button id="local">${state.hasLocalKey ? "Use your local key" : "Use a local key"}</button>
    ${advanced()}
  `);

  for (const identity of state.identities) {
    on(`as-${identity.id}`, () =>
      identity.kind === "local" ? unlockForm() : continueAs(identity),
    );
  }
  on("renown", signInWithRenown);
  on("local", () => (state.hasLocalKey ? unlockForm() : createForm()));
  wireAdvanced();
}

function identityRow(identity: Identity): string {
  const short = `${identity.address.slice(0, 6)}…${identity.address.slice(-4)}`;
  const name =
    identity.name ?? (identity.kind === "local" ? "Local key" : short);
  const avatar = identity.image
    ? `<img src="${esc(identity.image)}" alt="" />`
    : `<span class="initial">${esc(name.replace(/^0x/, "").charAt(0).toUpperCase())}</span>`;
  return `<li><button id="as-${esc(identity.id)}" class="identity">${avatar}
    <span><b>${esc(name)}</b><small>${esc(short)}</small></span></button></li>`;
}

function advanced(): string {
  const warning = state.syncedFolder
    ? `<p class="notice">This folder syncs with ${esc(state.syncedFolder)}. A live database can be damaged there, so a folder that doesn't sync is safer.</p>`
    : "";
  const change = state.rootLocked
    ? ""
    : `<button class="link" id="change-folder">Change</button>`;
  return `
    <p class="folder"><small>Your documents are in</small><br />${esc(state.root)} ${change}</p>
    ${warning}
    <details>
      <summary>Advanced</summary>
      <label>Renown instance
        <input id="renown-url" spellcheck="false" value="${esc(state.renownUrl)}" />
      </label>
      <button id="save-renown-url">Save</button>
    </details>`;
}

function wireAdvanced(): void {
  on("change-folder", chooseFolder);
  on("save-renown-url", async () => {
    const input = document.getElementById("renown-url") as HTMLInputElement;
    await invoke("save_renown_url", { url: input.value.trim() });
    renownReady = undefined;
    await home();
  });
}

async function chooseFolder(): Promise<void> {
  await invoke("pick_root");
  renownReady = undefined;
  await home();
}

function folderMissing(): void {
  show(`
    <h1>We can't find your ${esc(state.appName)} folder</h1>
    <p>${esc(state.root)} isn't there. If it's on a drive that isn't plugged in, plug it in and try again.</p>
    <button class="primary" id="retry" autofocus>Try again</button>
    <button id="change-folder">Choose another folder</button>
  `);
  on("retry", home);
  on("change-folder", chooseFolder);
}

function settingsBroken(): void {
  show(`
    <h1>settings.json can't be read</h1>
    <p>${esc(state.settingsError ?? "")}</p>
    <p>Fix the file, then try again. It's in ${esc(state.root)}.</p>
    <button class="primary" id="retry" autofocus>Try again</button>
  `);
  on("retry", home);
}

/* ---------------------------------------------------------------- Renown */

async function signInWithRenown(): Promise<void> {
  const session = await renown();
  const abort = new AbortController();
  show(`
    <h1>Finish signing in in your browser</h1>
    <p>Your browser has opened Renown. Come back here when you've approved ${esc(state.appName)}.</p>
    <button id="cancel">Cancel</button>
  `);
  on("cancel", () => abort.abort());
  try {
    const user = await consoleLogin(session, {
      renownUrl: session.baseUrl,
      open: (url) => window.phDesktop.openExternal(url),
      signal: abort.signal,
    });
    await saveProfile(session, user.address);
    await chooseData(user.address.toLowerCase());
  } catch (error) {
    if (!abort.signal.aborted) throw error;
    await home();
  }
}

/** Someone who has signed in here before needs neither Renown nor the network. */
async function continueAs(identity: Identity): Promise<void> {
  const session = await renown();
  if (session.user?.address.toLowerCase() === identity.address) {
    return chooseData(identity.id);
  }
  const kept = await invoke<PowerhouseVerifiableCredential | null>(
    "saved_credential",
    { address: identity.address, appDid: session.did },
  );
  if (!kept) return signInWithRenown();
  await session.adoptCredential(kept);
  await chooseData(identity.id);
}

const IMAGE_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The public profile, so this person can be named with no network. */
async function saveProfile(session: IRenown, address: string): Promise<void> {
  await Promise.race([
    session.refreshProfile().catch(() => false),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  const profile = session.user?.profile;
  let image: { ext: string; bytes: number[] } | null = null;
  try {
    if (profile?.userImage) {
      const response = await fetch(profile.userImage);
      const ext = IMAGE_TYPES[response.headers.get("content-type") ?? ""];
      if (response.ok && ext) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        image = { ext, bytes: [...bytes] };
      }
    }
  } catch {
    // A person with no picture here gets their initial.
  }
  await invoke("save_profile", {
    address: address.toLowerCase(),
    name: profile?.username ?? null,
    image,
  });
}

/* ------------------------------------------------------------- the local key */

function passwordFields(): string {
  return `
    <label>Password <input id="password" type="password" autocomplete="new-password" autofocus /></label>
    <label>Repeat it <input id="repeat" type="password" autocomplete="new-password" /></label>
    <p><small>The password protects the key, not your documents, which aren't encrypted on disk. It can't be recovered, but you can replace the key and keep your documents.</small></p>`;
}

function chosenPassword(): string | null {
  const value = (id: string) =>
    (document.getElementById(id) as HTMLInputElement).value;
  const password = value("password");
  if (password.length < PASSWORD_LENGTH) {
    notice = `Use at least ${PASSWORD_LENGTH} characters.`;
  } else if (password !== value("repeat")) {
    notice = "Those passwords don't match.";
  }
  return notice ? null : password;
}

function createForm(replacing = false): void {
  show(`
    <h1>${replacing ? "Replace your local key" : "Create a local key"}</h1>
    ${replacing ? "<p>This makes a new key. Your documents stay, and the old key stops working.</p>" : "<p>A key kept on this computer. It needs no account and no internet.</p>"}
    ${passwordFields()}
    <button class="primary" id="create">${replacing ? "Replace the key" : "Create the key"}</button>
    <button id="back">Back</button>
  `);
  on("back", home);
  on("create", async () => {
    const password = chosenPassword();
    if (password === null) return createForm(replacing);
    busy("Making your key…");
    await invoke("local_create", { password, replace: replacing });
    await unlock(password);
  });
}

function unlockForm(): void {
  show(`
    <h1>Unlock your local key</h1>
    <label>Password <input id="password" type="password" autocomplete="current-password" autofocus /></label>
    <button class="primary" id="unlock">Unlock</button>
    <button id="back">Back</button>
    <button class="link" id="replace">Forgot the password? Replace the key</button>
  `);
  const password = document.getElementById("password") as HTMLInputElement;
  password.addEventListener("keydown", (event) => {
    if (event.key === "Enter") document.getElementById("unlock")?.click();
  });
  on("back", home);
  on("replace", () => createForm(true));
  on("unlock", () => unlock(password.value));
}

async function unlock(password: string): Promise<void> {
  const session = await renown();
  busy("Unlocking…");
  try {
    const { credential } = await invoke<Unlocked>("local_unlock", {
      password,
      appDid: session.did,
      appName: APP_NAME,
    });
    await session.adoptCredential(credential, { local: true });
  } catch (error) {
    notice = message(error);
    return unlockForm();
  }
  await chooseData("local");
}

/* ------------------------------------------------------------------ starting */

/** Documents from before sign-in belong to whoever says so, and only then move. */
async function chooseData(identity: string): Promise<void> {
  if (!state.oldData) return start(identity);
  show(`
    <h1>Are these documents yours?</h1>
    <p>This folder has documents from before ${esc(state.appName)} had sign-in. They can move to this identity, or stay where they are.</p>
    <button class="primary" id="adopt" autofocus>Move them to this identity</button>
    <button id="leave">Leave them</button>
  `);
  on("adopt", async () => {
    await invoke("adopt_old_data", { identity });
    await start(identity);
  });
  on("leave", () => start(identity));
}

function busy(text: string): void {
  show(`<p class="busy"><span class="dot"></span>${esc(text)}</p>`);
}

async function start(identity: string): Promise<void> {
  busy(`Starting ${state.appName}…`);
  await invoke("start_stack", { identity });
}

window.phDesktopStartFailed = (text) => {
  notice = text;
  void home();
};

void home().catch(fail);
