function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message ?? `Expected ${expected}, received ${actual}`);
  }
}

function findModel(localPackage, documentType, version) {
  const model = localPackage.documentModels.find(
    (candidate) =>
      candidate.documentModel.global.id === documentType &&
      (version === undefined || (candidate.version ?? 1) === version),
  );
  assert(model, `Missing ${documentType} v${version ?? "latest"}`);
  return model;
}

async function resolveDriveId(client, requestedDriveId) {
  if (requestedDriveId) return requestedDriveId;
  const drives = await client.find({ type: "powerhouse/document-drive" });
  assert(
    drives.results[0],
    "Create a local drive in Connect, then run this smoke test again",
  );
  return drives.results[0].header.id;
}

export async function runConnectWorkerSmoke(requestedDriveId) {
  const ph = globalThis.ph;
  equal(ph?.reactorClientModule?.kind, "worker");
  const client = ph.reactorClient;
  const localPackage = ph.vetraPackageManager.packages.find(
    (candidate) => candidate.manifest?.name === "cf-mixed-test",
  );
  assert(localPackage, "Connect did not register the local mixed package");

  const driveId = await resolveDriveId(client, requestedDriveId);
  const legacy = findModel(localPackage, "test/legacy-todo", 1);
  const codeFirstV1 = findModel(localPackage, "test/code-first-todo", 1);
  const codeFirstV2 = findModel(localPackage, "test/code-first-todo", 2);

  const legacyDraft = legacy.utils.createDocument();
  legacyDraft.header.name = "Connect worker legacy smoke";
  const legacyCreated = await client.drives.addFile(driveId, legacyDraft);
  const legacyMutated = await client.execute(legacyCreated.header.id, "main", [
    legacy.actions.addLegacyTodo({
      id: "legacy-connect-worker-1",
      title: "Legacy mutation through Connect worker",
      completed: false,
    }),
  ]);
  equal(
    legacyMutated.state.global.todos[0].title,
    "Legacy mutation through Connect worker",
  );

  const codeFirstDraft = codeFirstV2.utils.createDocument();
  codeFirstDraft.header.name = "Connect worker code-first smoke";
  const codeFirstCreated = await client.drives.addFile(driveId, codeFirstDraft);
  const codeFirstMutated = await client.execute(
    codeFirstCreated.header.id,
    "main",
    [
      codeFirstV2.actions.addCodeFirstTodo({
        id: "code-first-connect-worker-1",
        title: "Code-first mutation through Connect worker",
      }),
      codeFirstV2.actions.renameCodeFirstList({
        name: "Renamed through Connect worker",
      }),
    ],
  );
  equal(
    codeFirstMutated.state.global.listName,
    "Renamed through Connect worker",
  );

  const v1Draft = codeFirstV1.utils.createDocument();
  v1Draft.header.name = "Connect worker V1 upgrade smoke";
  const v1Created = await client.drives.addFile(driveId, v1Draft);
  const v1Mutated = await client.execute(v1Created.header.id, "main", [
    codeFirstV1.actions.addCodeFirstTodo({
      id: "before-connect-upgrade",
      title: "Survives the Connect worker upgrade",
    }),
  ]);
  const beforeVersion = v1Mutated.state.document.version;
  const upgraded = await client.upgradeDocument(v1Created.header.id, 2);
  equal(beforeVersion, 1);
  equal(upgraded.state.document.version, 2);
  equal(upgraded.state.global.listName, "Migrated code-first todos");
  equal(
    upgraded.state.global.todos[0].title,
    "Survives the Connect worker upgrade",
  );

  const report = {
    ok: true,
    reactorKind: ph.reactorClientModule.kind,
    driveId,
    documents: {
      legacy: { id: legacyCreated.header.id, version: 1 },
      codeFirst: { id: codeFirstCreated.header.id, version: 2 },
      upgraded: { id: v1Created.header.id, fromVersion: 1, toVersion: 2 },
    },
  };
  console.info("Connect worker smoke passed", report);
  return report;
}
