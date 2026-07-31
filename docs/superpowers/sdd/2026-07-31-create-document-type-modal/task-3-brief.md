### Task 3: Update the two vetra-e2e specs that script the old footer

**Files:**
- Modify: `test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts:69-81`
- Modify: `test/vetra-e2e/tests/todo-document.spec.ts:502-519`

**Interfaces:**
- Consumes: the UI from Tasks 1–2 (button label `Create New Document`, select placeholder `Select document type…`, select id `document-type`, name placeholder `Document name`).
- Produces: nothing downstream.

These are Playwright specs that run in CI (`pnpm test:e2e:vetra`) against a
built Connect + published test package; they are not expected to run in this
plan. Update them so CI stays green; verify with typecheck only.

- [ ] **Step 1: Update `generic-drive-hidden-vetra-documents.spec.ts`**

Replace the block at lines 69–81 (the `"New document"` heading assertion, the
`.flex.w-full.flex-wrap.gap-4` section locator, and the hidden-name loop over
section buttons):

```ts
  // 4. Positive control: the "Create New Document" button renders.
  const createDocumentButton = page.getByRole("button", {
    name: "Create New Document",
  });
  await expect(createDocumentButton).toBeVisible({ timeout: 30_000 });
  await createDocumentButton.click();

  // 5. DocumentModel + every vetra builder-spec type must be absent from the
  // document-type select. ConnectSelect keeps its options in the DOM even
  // while collapsed, so presence is checked without opening the menu.
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Select document type…", { exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  for (const hiddenName of HIDDEN_DISPLAY_NAMES) {
    await expect(
      dialog.getByText(hiddenName, { exact: true }),
    ).toHaveCount(0, { timeout: 30_000 });
  }
```

- [ ] **Step 2: Update `todo-document.spec.ts`**

Replace the block at lines 502–519 (button-per-type click, name fill, Create
click). The `Create` locator MUST use `exact: true` — Playwright's `name`
matching is substring by default, and `"Create"` would also match the footer's
`"Create New Document"` button, a strict-mode violation:

```ts
    // Step 11: Create a document of the installed package type via the
    // "Create New Document" modal.
    const createDocumentButton = page.getByRole("button", {
      name: "Create New Document",
    });
    await expect(createDocumentButton).toBeVisible({ timeout: 30_000 });
    await createDocumentButton.click();

    const dialog = page.getByRole("dialog");

    // Fill in document name in the create document dialog
    const docNameInput = dialog.locator('input[placeholder="Document name"]');
    await expect(docNameInput).toBeVisible({ timeout: 10_000 });
    await docNameInput.fill("TestTodoDoc");

    // Pick the ToDoDocument type from the select
    await dialog.getByText("Select document type…", { exact: true }).click();
    await dialog.getByText("ToDoDocument", { exact: false }).first().click();

    const createDocButton = dialog.getByRole("button", {
      name: "Create",
      exact: true,
    });
    await expect(createDocButton).toBeEnabled({ timeout: 5_000 });
    await createDocButton.click();
```

Keep everything after this block (document-created assertions) unchanged.

- [ ] **Step 3: Typecheck the e2e package**

```bash
cd /home/p/Powerhouse/powerhouse && pnpm --filter test-package-vetra typecheck
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
cd /home/p/Powerhouse/powerhouse
git add test/vetra-e2e/tests/generic-drive-hidden-vetra-documents.spec.ts \
        test/vetra-e2e/tests/todo-document.spec.ts
git commit -m "test(vetra-e2e): script the Create New Document modal instead of per-type buttons"
```

---

