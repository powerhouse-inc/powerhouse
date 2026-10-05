/**
 * Agent definitions — one source of truth for both runners.
 *
 * `agents/<name>.md` holds an OMP task-agent definition: frontmatter
 * (name, description, model, tools, optional output schema) plus a body that
 * is the system prompt. OMP discovers these files itself from the plugin's
 * `agents/` root, so the same file both drives the harness and shows up as a
 * spawnable agent in the host session.
 *
 * The task runner hands the parsed definition to OMP's `runSubprocess`; the
 * process runner writes the body to a temp file and passes it as
 * `--append-system-prompt`. Neither owns the prompt.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { agentsDir } from "./paths.mjs";

/**
 * Parse the frontmatter subset these definitions use: `key: value` scalars,
 * comma-separated lists for `tools`, and a JSON flow mapping for `output`.
 * Anything richer belongs in the body, not the header.
 */
export function parseAgentFile(text, source = "<inline>") {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m)
    throw new Error(`${source}: agent definition has no frontmatter block`);
  const [, header, body] = m;
  const fm = {};
  for (const raw of header.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i === -1)
      throw new Error(
        `${source}: frontmatter line is not "key: value": ${line}`,
      );
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    fm[key] = value;
  }
  if (!fm.name) throw new Error(`${source}: frontmatter is missing "name"`);
  if (!fm.description)
    throw new Error(`${source}: frontmatter is missing "description"`);
  const systemPrompt = body.trim();
  if (!systemPrompt)
    throw new Error(
      `${source}: agent definition has an empty body (system prompt)`,
    );

  const def = {
    name: fm.name,
    description: fm.description,
    systemPrompt,
    source: "project",
  };
  if (fm.tools) {
    def.tools = fm.tools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (fm.model) def.model = fm.model;
  if (fm["thinking-level"]) def.thinkingLevel = fm["thinking-level"];
  if (fm.output) {
    try {
      def.output = JSON.parse(fm.output);
    } catch (e) {
      throw new Error(
        `${source}: "output" must be single-line JSON: ${e.message}`,
      );
    }
  }
  return def;
}

const cache = new Map();

/** Load `agents/<name>.md`. Cached: definitions do not change mid-run. */
export function loadAgentDef(name, dir = agentsDir) {
  const path = join(dir, `${name}.md`);
  const key = path;
  if (cache.has(key)) return cache.get(key);
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(
      `agent definition ${name} not found at ${path}: ${e.message}`,
    );
  }
  const def = parseAgentFile(text, path);
  if (def.name !== name) {
    throw new Error(
      `agent definition ${path} declares name "${def.name}" — must match its filename`,
    );
  }
  cache.set(key, { ...def, filePath: path });
  return cache.get(key);
}

/** Test seam. */
export function clearAgentDefCache() {
  cache.clear();
}
