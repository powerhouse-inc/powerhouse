## Gap Report: Mastery Track — Launch Your Project

Reviewed: `docs/academy/02-MasteryTrack/05-LaunchYourProject`
Against: `clis/ph-cmd`, `apps/switchboard`, `docker/`
Focus: Deploy commands, Docker image names, environment variable names, switchboard config format

### Findings

| #   | Urgency | Type  | Doc location                                                                           | Source location                                                        | Finding                                                                                                                                                                                                                                                   |
| --- | ------- | ----- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | high    | wrong | `ph use prod` — `02-PublishYourProject.md` line 66                                     | `clis/ph-cmd/src/commands/use.ts:19–28`                                | `"prod"` is not a valid tag. The `use` command's `oneOf` validator accepts only `"latest"`, `"staging"`, and `"dev"`. Running `ph use prod` would fail with a validation error                                                                            |
| 2   | high    | wrong | `PH_PACKAGES` env var for Connect image — `03-DeployWithDocker.md` (Connect env table) | `docker/connect-entrypoint.sh` and `packages/config/src/powerhouse.ts` | Connect uses `PH_REGISTRY_PACKAGES`, not `PH_PACKAGES`. The entrypoint reads `PH_REGISTRY_PACKAGES` to write a `ph-packages.json` registry config for dynamic module loading — it does not run `pnpm add`. Setting `PH_PACKAGES` has no effect on Connect |
| 3   | medium  | stale | Connect image `PORT` default documented as `4000` — `03-DeployWithDocker.md`           | `docker/Dockerfile:59`                                                 | Dockerfile sets `ENV PORT=3001` for the Connect stage; the documented default of `4000` is wrong                                                                                                                                                          |
| 4   | medium  | stale | Switchboard image `PORT` default documented as `4001` — `03-DeployWithDocker.md`       | `docker/Dockerfile:96`                                                 | Dockerfile sets `ENV PORT=3000` for the Switchboard stage; the documented default of `4001` is wrong                                                                                                                                                      |
| 5   | medium  | stale | Switchboard container starts via `ph switchboard` — `03-DeployWithDocker.md`           | `docker/switchboard-entrypoint.sh`                                     | The entrypoint starts Switchboard with `node "$ENTRY"` directly, not via `ph switchboard`. There is no `ph switchboard` subcommand registered in `clis/ph-cmd/src/commands/ph.ts`                                                                         |
| 6   | medium  | stale | Migrations triggered by `DATABASE_URL` — `03-DeployWithDocker.md`                      | `docker/switchboard-entrypoint.sh`                                     | The entrypoint checks `PH_REACTOR_DATABASE_URL` (not `DATABASE_URL`) to decide whether to run migrations. Setting only `DATABASE_URL` would skip the migration step                                                                                       |

### Verified clean

- Docker image names `ghcr.io/powerhouse-inc/powerhouse/connect`, `/switchboard`, `/academy` — confirmed correct in `docker/Dockerfile` build targets
- `ph use latest` / `ph use staging` / `ph use dev` — all valid tags per `clis/ph-cmd/src/commands/use.ts:19–28`
- `ph init`, `ph update`, `ph setup-globals` — all registered commands in `clis/ph-cmd/src/commands/ph.ts`
- `PH_PACKAGES` env var for Switchboard image — entrypoint uses `PH_PACKAGES` to run `pnpm add` at startup ✅ (Switchboard is correct; only Connect is wrong)
- `PH_SWITCHBOARD_DATABASE_URL` for Switchboard database connection — confirmed in `apps/switchboard/src/config.ts`
- `PH_SWITCHBOARD_PORT` for Switchboard port — confirmed in `apps/switchboard/src/config.ts`
- Switchboard `auth` config shape `{ enabled, admins }` — both fields present in `apps/switchboard/src/types.ts:StartServerOptions`; source also has `guests` and `users` fields not mentioned in doc (omission, not a wrong claim)

### Could not verify

- `ph publish` and `ph vetra` command details — these subcommands are not in `clis/ph-cmd`; they may live in a separate CLI package (`vetra`) not read during this review
- `timeouts` and `rateLimiting` fields in switchboard config examples — `StartServerOptions` in `apps/switchboard/src/types.ts` does not declare these; may come from an extended type in a different file not read
- `docker-compose.yml` port mapping alignment — the repo `docker-compose.yml` maps `3000:4000` (connect) and `4000:4001` (switchboard), which conflicts with the Dockerfile `ENV PORT` defaults (3001/3000). This is a potential runtime configuration issue but the exact doc claim was not line-anchored during this review

### Summary

6 findings (2 stale + 4 wrong/stale — 2 high urgency, 4 medium). The two critical issues are: `ph use prod` is an invalid tag that will error, and the Connect image env var is `PH_REGISTRY_PACKAGES` not `PH_PACKAGES`, meaning a developer following the Docker deployment guide would set the wrong variable and wonder why their packages aren't loading.
