/** Scaffold, pinned inputs, settings, prompts, install: everything before the builder. */
import { createStep } from "@mastra/core/workflows";
import { mkdirSync } from "node:fs";
import { deniedRoots } from "../lib/context.js";
import { buildBuilderPrompts } from "../lib/prompts.js";
import { PrepareWorkspaceOutput } from "../lib/schemas.js";
import {
  builderSettings,
  judgeSettings,
  verifierSettings,
  writeSettings,
} from "../lib/settings.js";
import {
  copyPinnedInputs,
  copyReference,
  installWorkspace,
  scaffoldWorkspace,
  type InstallResult,
} from "../lib/workspace.js";
import {
  attemptLabel,
  attemptScope,
  readCached,
  TaskRunInput,
  writeJson,
  writeText,
} from "./shared.js";

const INSTALL_TIMEOUT_MS = 900_000;

export const prepareWorkspace = createStep({
  id: "prepareWorkspace",
  inputSchema: TaskRunInput,
  outputSchema: PrepareWorkspaceOutput,
  retries: 0,
  execute: async (params) => {
    const { inputData } = params;
    const { input, ctx, task, run, layout } = attemptScope(inputData);
    const cached = readCached(layout.prepareJson, PrepareWorkspaceOutput);
    if (cached) return cached;

    mkdirSync(layout.dir, { recursive: true });
    scaffoldWorkspace({ dir: layout.workspaceDir, task, pin: input.pin });
    copyPinnedInputs(task, layout.workspaceDir, ctx.pinnedRoot);
    if (input.arm === "B") {
      copyReference(ctx.recipesRoot, task, layout.referenceDir);
    }

    const denied = deniedRoots(ctx);
    writeSettings(
      layout.settingsFile,
      builderSettings({
        workspaceDir: layout.workspaceDir,
        docsDir: input.docsDir,
        deniedRoots: denied,
        arm: input.arm,
        referenceDir: layout.referenceDir,
        sandbox: input.args.sandbox,
      }),
    );
    writeSettings(
      layout.judgeSettingsFile,
      judgeSettings({
        attemptDir: layout.dir,
        docsDir: input.docsDir,
        dtsDir: layout.dtsDir,
      }),
    );
    writeSettings(
      layout.verifierSettingsFile,
      verifierSettings({
        workspaceDir: layout.workspaceDir,
        docsDir: input.docsDir,
        deniedRoots: denied,
      }),
    );

    const prompts = buildBuilderPrompts(
      task,
      {
        docsDir: input.docsDir,
        pin: input.pin,
        workspaceDir: layout.workspaceDir,
        arm: input.arm,
        referenceDir: input.arm === "B" ? layout.referenceDir : undefined,
      },
      ctx.promptsRoot,
    );
    writeText(layout.systemPromptFile, prompts.system);
    writeText(layout.taskPromptFile, prompts.task);

    let install: InstallResult;
    if (ctx.dryRun) {
      writeText(layout.installLogPath, "dry run: install skipped\n");
      install = {
        ok: true,
        ms: 0,
        installedVersion: input.pin,
        fromCache: false,
      };
    } else {
      install = await (ctx.installer ?? installWorkspace)({
        dir: layout.workspaceDir,
        task,
        cacheDir: run.installCacheDir,
        logPath: layout.installLogPath,
        timeoutMs: INSTALL_TIMEOUT_MS,
      });
    }
    ctx.log(
      `${attemptLabel(input)} install ${install.ok ? "ok" : "FAILED"} ${install.ms}ms${install.fromCache ? " (cached lockfile)" : ""}`,
    );

    const out: PrepareWorkspaceOutput = {
      workspaceDir: layout.workspaceDir,
      installOk: install.ok,
      installMs: install.ms,
      installLogPath: layout.installLogPath,
      installedVersion: install.installedVersion,
    };
    writeJson(layout.prepareJson, out);
    return out;
  },
});
