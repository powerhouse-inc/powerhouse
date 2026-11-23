## 6.4.0-next.3 (2026-11-23)

### 🚀 Features

- ⚠️  **switchboard,connect:** no built-in vetra package ([1e9b9ba2c6](https://github.com/powerhouse-inc/powerhouse/commit/1e9b9ba2c6))
- ⚠️  **ph-cli:** generate stubs only, no dependency on the vetra package ([329d9de807](https://github.com/powerhouse-inc/powerhouse/commit/329d9de807))

### ⚠️  Breaking Changes

- **switchboard,connect:** no built-in vetra package  ([1e9b9ba2c6](https://github.com/powerhouse-inc/powerhouse/commit/1e9b9ba2c6))
  switchboard dev mode and Connect studio mode no longer
  load @powerhousedao/vetra by themselves.
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016fHjTMdimGetqa3JnGXsnE
- **ph-cli:** generate stubs only, no dependency on the vetra package  ([329d9de807](https://github.com/powerhouse-inc/powerhouse/commit/329d9de807))
  ph generate --document and --extract are removed.
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016fHjTMdimGetqa3JnGXsnE

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.4.0-next.2 (2026-11-23)

This was a version bump only for @powerhousedao/clint-common to align it with other projects, there were no code changes.

## 6.4.0-next.1 (2026-11-22)

### 🚀 Features

- **vetra:** move the ideate and build spec documents from vetra-cli ([bfc530d0f3](https://github.com/powerhouse-inc/powerhouse/commit/bfc530d0f3))

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.4.0-next.0 (2026-11-22)

### 🚀 Features

- **clint-common:** publish the package ([34cc3966cd](https://github.com/powerhouse-inc/powerhouse/commit/34cc3966cd))
- **clint-common:** a downloads folder option for extracted chat files ([e105cfdf21](https://github.com/powerhouse-inc/powerhouse/commit/e105cfdf21))
- **codegen,ph-cli,shared:** a package with a cli declares clint as a versioned peer ([40936957cb](https://github.com/powerhouse-inc/powerhouse/commit/40936957cb))
- **ph-cli,shared:** the cli of a package is its own build, with declared packages external ([8504275af5](https://github.com/powerhouse-inc/powerhouse/commit/8504275af5))
- **clint-common:** port the chat-session package from ph-clint dev.113 ([d21119c6a9](https://github.com/powerhouse-inc/powerhouse/commit/d21119c6a9))
- **clint:** add the ./cli package export and the cli runner ([64bb9f10c9](https://github.com/powerhouse-inc/powerhouse/commit/64bb9f10c9))
- **ph-cli:** ph run connect build takes --base and --packages-registry ([894d5a7f31](https://github.com/powerhouse-inc/powerhouse/commit/894d5a7f31))
- ⚠️  **ph-cli:** a project without hosts is an error ([33b90cff3d](https://github.com/powerhouse-inc/powerhouse/commit/33b90cff3d))

### 🩹 Fixes

- **host-core,ph-run:** linux failures in the next/6.4 checks ([0fdc5a4797](https://github.com/powerhouse-inc/powerhouse/commit/0fdc5a4797))
- **clint-common:** version in lockstep with the other packages ([2db01b6e27](https://github.com/powerhouse-inc/powerhouse/commit/2db01b6e27))
- **clint-common,clint:** chat-session attachment fields are attachment refs ([ebbfda2bed](https://github.com/powerhouse-inc/powerhouse/commit/ebbfda2bed))
- **clint,clint-common:** attachment reads name the document that references the attachment ([c26c9ce1eb](https://github.com/powerhouse-inc/powerhouse/commit/c26c9ce1eb))
- **clint,clint-common:** close the gaps the vetra-cli port found ([b9b8c7c477](https://github.com/powerhouse-inc/powerhouse/commit/b9b8c7c477))

### ⚠️  Breaking Changes

- **ph-cli:** a project without hosts is an error  ([33b90cff3d](https://github.com/powerhouse-inc/powerhouse/commit/33b90cff3d))
  the classic commands need a hosts/ folder; run ph migrate.
  Co-Authored-By: Claude <noreply@anthropic.com>

### ❤️ Thank You

- Claude
- Wouter Kampmann