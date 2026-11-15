# Moving to hosts and `ph run`

Since 6.3 a project describes every way it can run in a `hosts/` folder, and
`ph run <host>` starts any of them. The classic commands (`ph vetra`,
`ph connect`, `ph switchboard`, `ph reactor`) still work in 6.3 and print a
warning. Their own boot path is removed in 6.4.

This page takes a project from the classic commands to hosts. For what a host
file contains, see [Hosts, Runners & Plugins](/academy/Reference/HostsAndRunners/HostsRunnersAndPlugins).

## Who needs this page

You need it when one of these is true:

- Your project has no `hosts/` folder, or the folder holds no
  `<name>/host.js`.
- A `ph` command prints a line that starts with `Warning:` and ends with a
  link to this page.
- Your scripts, Dockerfile or CI call `ph vetra`, `ph connect`,
  `ph switchboard` or `ph reactor`.
- Your environment sets `FEATURE_UNIFORM_RUNNERS_ENABLED` or
  `FEATURE_PLUGIN_HOST_ENABLED`.

A project created with `ph init` on 6.3 already has `hosts/`. It needs this
page only for the warnings it still prints.

## Upgrade in two steps

Go to 6.3 first, clear the warnings there, then go to 6.4.

1. Upgrade the project to 6.3 and run `ph migrate`. Everything keeps working;
   what 6.4 removes prints a warning.
2. Work through the warnings with the list on this page until none are left.
3. Upgrade to 6.4.

If you skip 6.3, 6.4 fails where 6.3 warns, and you fix the same things
without the warnings to guide you.

Run a deployed Switchboard on 6.3 once before you move it to 6.4. From 6.3 a
store records the release that last completed its one-time migrations. A later
release that has dropped a migration uses that record to refuse a store that
still needs it, and names the release to run first.

## Run `ph migrate`

`ph migrate` updates the project files and adds the host files. Run it from
the project folder, or from any folder below it.

### 1. Commit your work

Start from a clean working tree, so the changes `ph migrate` makes are easy to
review and to undo. `ph migrate` replaces the agent files of the project
(such as `AGENTS.md` and `CLAUDE.md`). It stops before it writes anything when one of them has
uncommitted changes.

### 2. Preview the changes

```bash
ph migrate 6.3.0 --dry-run
```

The dry run prints a diff for every file it would add, change or delete and
writes nothing. It ends with the number of files and the steps it did not
preview: installing the dependencies, syncing the agent skills, and
re-generating the code of your document models, editors, apps, processors and
subgraphs.

Leave out the version to stay on the release channel your project already
uses. `ph migrate` prints the version it picked.

### 3. Run it

```bash
ph migrate 6.3.0
```

`ph migrate` does this:

1. Updates `package.json`. It sets the Powerhouse dependencies to the target
   version and adds missing scripts. A script that still has the value an
   earlier `ph init` wrote is updated, for example `ph-cli vetra` becomes
   `ph-cli run vetra`. A script you changed yourself is kept, and
   `ph migrate` prints which ones it kept.
2. Removes the lint and format configuration files of older scaffolds.
3. Adds the root files the project lacks, such as the Dockerfile and the CI
   workflows. A root file the project already has is kept as it is. When the
   current template has lines the kept file lacks, `ph migrate` prints one
   line with a link to the template. The JSON configuration files, such as
   `tsconfig.json`, gain the keys and entries they lack and keep the values
   you set. `ph migrate` also removes the compiler options TypeScript 7
   dropped.
4. Replaces the agent files.
5. Adds the `hosts/` folder when the project has no `hosts/<name>/host.js`
   yet. Existing host files are never overwritten.
6. Moves the settings the new host files take over out of
   `powerhouse.config.json`, and prints what it did with each key. See
   [Settings](#settings).
7. Installs the dependencies and re-generates the code.

A project that still has document models on the 5.x layout (no `v1/` folder)
is refused with the names of those models. Run the 6.2.2 migration first, then
this one again:

```bash
npx @powerhousedao/ph-cli@6.2.2 migrate 6.2.2
```

### 4. Review the host files

`ph migrate` writes these host files:

```
hosts/
  README.md
  connect/host.js        ph run connect
  switchboard/host.js    ph run switchboard
  vetra/host.js          ph run vetra
  desktop/host.js        ph run desktop
  assistant/host.js      ph run assistant
  cli/host.js            ph run cli
```

Open `hosts/switchboard/host.js` and check `runner.plugins`. `ph migrate`
lists the plugins the classic Switchboard ran: MCP, attachments and privacy.
It adds the workflows plugin only when `powerhouse.config.json` sets
`workflows.enabled` to `true`.

`ph migrate` does not read your environment. If you switched a feature on or
off with an environment variable only, add or remove that plugin yourself.

### 5. Move the settings `ph migrate` leaves alone

When `ph migrate` adds the host files, it moves `studio.host`,
`studio.openBrowser` and `reactor.https` into them and removes the keys from
`powerhouse.config.json`. It prints one line for each key, for example:

```text
Settings of powerhouse.config.json the host files take:
  studio.host: moved to runner.host in hosts/connect/host.js
  reactor.storage: kept, the switchboard does not read it when it starts, so moving it would change where the reactor keeps its data. To use it, set reactor.backends.<name>.storage in hosts/switchboard/host.js and remove the key.
```

A moved setting takes effect under `ph run`. The classic commands did not
all read these keys, so check that the address and the browser behaviour are
what you want.

`ph migrate` keeps these keys, and you move them by hand:

- `reactor.storage` and `switchboard.database.url`. Moving them would change
  where the reactor keeps its data. Set the storage in
  `hosts/switchboard/host.js` when you are ready to move the data, then
  delete the key.
- `studio.https`. The Connect host has no setting that serves https.
- Every key in [Settings](#settings), when the project already had host
  files. `ph migrate` does not edit host files it did not write.

### 6. Check the hosts

```bash
ph host check switchboard
ph host check connect
ph host check vetra
```

`ph host check` loads and validates a host the way `ph run` would, without
starting it. It exits with code 1 when it finds a problem.

## Old and new

### Commands

| Old                               | New                                 |
| --------------------------------- | ----------------------------------- |
| `ph vetra`                        | `ph run vetra`                      |
| `ph vetra --watch`                | `ph run vetra`                      |
| `ph vetra --interactive`          | `ph run vetra --interactive`        |
| `ph connect`, `ph connect studio` | `ph run connect dev`                |
| `ph connect build`                | `ph run connect build`              |
| `ph connect preview`              | `ph run connect serve`              |
| `ph switchboard`                  | `ph run switchboard`                |
| `ph reactor`                      | `ph run switchboard`                |
| `ph switchboard --dev`            | `ph run switchboard dev`            |
| `ph switchboard --migrate`        | `ph run switchboard migrate`        |
| `ph switchboard --migrate-status` | `ph run switchboard migrate-status` |
| `ph switchboard --reset`          | `ph run switchboard reset`          |
| `ph init --uniform-runners`       | `ph init`                           |

`ph connect config` is a tool, not a way to run Connect. It stays as it is.

`--watch` is no longer needed. `ph run` accepts it, prints one line and
ignores it.

Arguments after the host and the verb go to the runner. When you pass one the
runner does not accept, `ph run` stops and lists the ones it does accept.

### Settings

These `powerhouse.config.json` keys are read by the classic commands only.
`ph run` ignores them, and 6.4 refuses them.

| Old key in `powerhouse.config.json` | New home                                                             |
| ----------------------------------- | -------------------------------------------------------------------- |
| `studio.host`                       | `runner.host` in `hosts/connect/host.js`                             |
| `studio.https`                      | None. The Connect host serves http.                                  |
| `studio.openBrowser`                | `runner.openBrowser` in `hosts/connect/host.js`                      |
| `reactor.https`                     | `config.switchboard.server.https` in `hosts/switchboard/host.js`     |
| `reactor.storage`                   | `reactor.backends.<name>.storage` in `hosts/switchboard/host.js`     |
| `switchboard.database.url`          | `reactor.backends.<name>.storage.url` in `hosts/switchboard/host.js` |

These keys stay in `powerhouse.config.json`, because the scaffolded host files
read them: `studio.port`, `reactor.port`, `vetra.connectPort`,
`assistant.port` and the `connect` block.

Four Connect keys move into the configuration of the generic Connect plugin.
In `hosts/connect/host.js`, list `@powerhousedao/connect/plugins/generic`
under `runner.plugins` and set them in its entry `config`:

| Old key in `powerhouse.config.json` | Key in the plugin entry `config` |
| ----------------------------------- | -------------------------------- |
| `connect.drives.allowAddDrive`      | `allowAddDrive`                  |
| `connect.drives.sections`           | `sections`                       |
| `connect.drives.icons`              | `icons`                          |
| `connect.home.background`           | `homeBackground`                 |

### Environment variables

| Variable                            | What to do                                                                             |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| `FEATURE_UNIFORM_RUNNERS_ENABLED`   | Remove it. It has no effect since 6.3.                                                 |
| `FEATURE_PLUGIN_HOST_ENABLED=false` | Remove it. Switchboard then starts the same subsystems through the plugin host.        |

`MCP_ENABLED` and `PH_WORKFLOWS_ENABLED` stay.

## Warnings and what to do

Each warning prints once per command, on stderr. The parts that depend on your
project, such as the command you typed, are shown here in angle brackets.

### The project has no host files {/* #no-host-files */}

```text
Warning: This project has no hosts/<name>/host.js, so `<command>` runs the classic way, which stops working in 6.4. Run `ph migrate` to add the host files, then use `<replacement>`.
```

Follow [Run `ph migrate`](#run-ph-migrate), then use the replacement command
the warning names.

A `hosts/` folder without any `<name>/host.js` counts as no hosts. `ph` then
also prints that the folder defines no host.

### A classic command, and that host file is missing {/* #missing-host-file */}

```text
Warning: `<command>` runs the classic way, which stops working in 6.4. This project has no hosts/<host>/host.js: add that host file, then use `<replacement>`.
```

The project has hosts, but not the one this command needs. `ph migrate` adds
host files only to a project that has none, so add this one yourself: write
`hosts/<host>/host.js`, using the
[host file reference](/academy/Reference/HostsAndRunners/HostsRunnersAndPlugins#the-host-file).
Then run `ph generate hosts` to update the generated typing files.

### A classic command in a project with hosts {/* #classic-command */}

```text
Warning: `<command>` runs the classic way and does not read hosts/<host>/host.js. The classic way stops working in 6.4: use `<replacement>` instead.
```

The host file exists, but `ph connect` and `ph switchboard` do not read it.
Change the command in your scripts, Dockerfile and CI to the replacement the
warning names. See [Commands](#commands).

`ph vetra` is different: in a project with `hosts/vetra/host.js` it already
runs `ph run vetra` and prints no warning.

### `ph reactor` {/* #ph-reactor */}

```text
Warning: `ph reactor` is a deprecated alias and is removed in 6.4. Use `ph run switchboard` instead.
```

Replace `ph reactor` with `ph run switchboard`.

### A Switchboard flag that became a verb {/* #switchboard-verbs */}

```text
Warning: `ph switchboard --migrate` is deprecated and stops working in 6.4. Use `ph run switchboard migrate` instead.
```

`--migrate`, `--migrate-status`, `--reset` and `--dev` are verbs of the
switchboard host now. Put the verb after the host name, without the dashes.

### A flag that is deprecated {/* #deprecated-flag */}

```text
Warning: `<command> <flag>` is deprecated and stops working in 6.4: <what to do instead>
```

Follow the instruction at the end of the warning. For `--watch` that is
removing the flag.

### A flag with no `ph run` argument {/* #flag-without-argument */}

```text
Warning: `<command> <flag>` has no `<replacement>` argument and stops working in 6.4. Set what it configures in the host files under hosts/ instead.
```

`ph run` has no argument for this flag. Set the value in the host file of
that host instead. The
[host file reference](/academy/Reference/HostsAndRunners/HostsRunnersAndPlugins)
lists the keys.

### A `powerhouse.config.json` key that 6.4 refuses {/* #config-keys */}

A classic command prints:

```text
Warning: powerhouse.config.json sets <keys>: only the classic commands read them, and 6.4 refuses them. Move <key> to <new home>.
```

`ph run` prints, for each key:

```text
Warning: powerhouse.config.json "<key>" is ignored by `ph run` and is an error in 6.4. Set <new home> and remove the key.
```

Move each key to the place the warning names and delete it from
`powerhouse.config.json`. The full list is under [Settings](#settings).

Under `ph run` the old key has no effect already. If a host started with a
different address or database than you expected, this is the reason.

### `FEATURE_PLUGIN_HOST_ENABLED` {/* #feature-plugin-host-enabled */}

```text
Warning: FEATURE_PLUGIN_HOST_ENABLED=false stops working in 6.4. It keeps Switchboard on the classic boot path, which 6.4 removes: the plugin host is then the only path. Remove the variable: Switchboard then starts the same subsystems through the plugin host. To choose them yourself, list the plugins under `runner.plugins` in hosts/switchboard/host.js.
```

Remove the variable from your environment, `.env` files and deployment
configuration. The values `false`, `0`, `off` and `no` select the classic
boot path. Without the variable, Switchboard starts the same subsystems
through the plugin host: MCP, attachments, privacy and workflows, each under
the switch that selected it before. To choose the plugins yourself, list them
under `runner.plugins` in `hosts/switchboard/host.js`.

### `FEATURE_UNIFORM_RUNNERS_ENABLED` {/* #feature-uniform-runners-enabled */}

```text
Warning: FEATURE_UNIFORM_RUNNERS_ENABLED=false has no effect since 6.3. Hosts and `ph run` are always on now. Remove the variable: 6.4 will refuse to start with it set to false.
```

Remove the variable. Set to a true value it does nothing and prints nothing,
but there is no reason to keep it.

### `reactor.workflows` in a host file {/* #reactor-workflows */}

```text
Warning: <host file>: reactor.workflows is deprecated and stops working in 6.4. Workflows are a plugin: "<plugin>" under runner.plugins switches them on, leaving it out switches them off. Remove the key.
```

Remove `reactor.workflows` from the host file. To run workflows, list the
plugin the warning names under `runner.plugins`. To run without them, leave
the plugin out.

### Connect settings in the host `config` {/* #connect-chrome-settings */}

```text
Warning: <host file>: config.drives.allowAddDrive is only read by the classic Connect boot, which 6.4 removes. List "@powerhousedao/connect/plugins/generic" under runner.plugins and set allowAddDrive / sections / icons / homeBackground in its entry config.
```

Move the keys into the entry of the generic Connect plugin, as shown under
[Settings](#settings).

### `readModel.url` also holds the reactor store {/* #read-model-url */}

```text
Warning: <host file>: reactor readModel.url (<url>) also holds the reactor store, because no storage names one. This is deprecated and stops working in 6.4: set the backend's storage explicitly (the same Postgres url, or a path dataDir).
```

The host file names a database for the read models and none for the reactor
store, so both use the same one. Add a `storage` to the backend under
`reactor.backends`. Use the same Postgres URL to keep the data where it is.

### `ph init --uniform-runners` {/* #init-uniform-runners */}

```text
--uniform-runners is no longer needed: `ph init` always scaffolds hosts/. The option will be removed in a future release.
```

Remove the option from the command.

## Check that you are done

Start every host you use and read the first lines of output:

```bash
ph run switchboard
ph run connect dev
ph run vetra
```

You are done when:

- No line starts with `Warning:`.
- `ph host check <host>` exits with code 0 for each host.
- A search of your scripts, Dockerfile and CI finds no `ph vetra`,
  `ph connect`, `ph switchboard` or `ph reactor`. `ph connect config` is fine.
- Your environment and deployment configuration set neither
  `FEATURE_UNIFORM_RUNNERS_ENABLED` nor `FEATURE_PLUGIN_HOST_ENABLED`.

Run the check with the same environment as your deployment. Some warnings
depend on environment variables that your own machine may not set.

## What happens in 6.4 if you do nothing

6.4 removes what 6.3 warns about:

- A project without host files does not start. The error names `ph migrate`.
- The classic boot path of `ph vetra`, `ph connect` and `ph switchboard` is
  gone. The three names stay as short forms of `ph run <host>`, and
  `ph connect studio`, `ph connect build` and `ph connect preview` stay as
  short forms of the `dev`, `build` and `serve` verbs. A flag that has no
  `ph run` argument fails.
- `ph reactor` is removed.
- The `powerhouse.config.json` keys under [Settings](#settings) are errors.
- `FEATURE_UNIFORM_RUNNERS_ENABLED=false` stops the start.
  `FEATURE_PLUGIN_HOST_ENABLED` is removed: the plugin host is the only path.
- `reactor.workflows` and the `readModel.url` fallback in host files are
  removed.
