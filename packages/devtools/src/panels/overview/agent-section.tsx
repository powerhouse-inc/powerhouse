import { useId, useState } from "react";
import { Code } from "../../components/code.js";
import { CopyButton, CopyCommand } from "../../components/copy-button.js";
import { Section, Subsection } from "../../components/section.js";
import { Segmented } from "../../components/segmented.js";
import { Mono } from "../../components/text.js";
import { tabPanelProps } from "../../components/tabs.js";

/** The `reactor-mcp` entry `ph init` writes for each agent: `.mcp.json`,
 * `.cursor/mcp.json` and `.gemini/settings.json`. */
const AGENTS = [
  {
    id: "claude",
    title: "Claude Code",
    file: ".mcp.json",
    command: "claude mcp add --scope project reactor-mcp -- node --run mcp",
    server: { type: "stdio", command: "node", args: ["--run", "mcp"] },
  },
  {
    id: "cursor",
    title: "Cursor",
    file: ".cursor/mcp.json",
    // Cursor's CLI has no command that adds a server.
    command: null,
    server: {
      type: "stdio",
      command: "node",
      args: [
        "${workspaceFolder}/node_modules/@powerhousedao/ph-cli/dist/cli.mjs",
        "mcp",
        "--project-dir",
        "${workspaceFolder}",
      ],
    },
  },
  {
    id: "gemini",
    title: "Gemini CLI",
    file: ".gemini/settings.json",
    command: "gemini mcp add reactor-mcp node -- --run mcp",
    server: { command: "node", args: ["--run", "mcp"] },
  },
] as const;

type AgentId = (typeof AGENTS)[number]["id"];

export function AgentSection({
  mcpUrl,
}: {
  mcpUrl: string | null | undefined;
}) {
  const [selected, setSelected] = useState<AgentId>("claude");
  const agent = AGENTS.find((a) => a.id === selected) ?? AGENTS[0];
  const panelId = useId();
  const config = JSON.stringify(
    { mcpServers: { "reactor-mcp": agent.server } },
    null,
    2,
  );
  return (
    <Section
      title="Connect an agent"
      data-testid="ph-overview-agent"
      data-agent={agent.id}
      tabs={
        <Segmented
          mode={{ kind: "tabs", panelId }}
          label="Agent"
          items={AGENTS.map((a) => ({
            id: a.id,
            label: a.title,
            data: { "data-agent": a.id },
          }))}
          value={selected}
          onChange={setSelected}
        />
      }
    >
      <div
        {...tabPanelProps(panelId, selected)}
        className="flex min-w-0 flex-col gap-4"
      >
        {agent.command && (
          <Subsection title="Add it with a command">
            <CopyCommand command={agent.command} className="min-w-0" />
          </Subsection>
        )}
        <Subsection
          title={
            <>
              {agent.command ? "Or add it to" : "Add it to"}{" "}
              <Mono className="font-normal">{agent.file}</Mono>
            </>
          }
        >
          <div className="relative min-w-0">
            <Code lang="json">{config}</Code>
            <div className="absolute top-1 right-1">
              <CopyButton text={config} />
            </div>
          </div>
        </Subsection>
        {mcpUrl && (
          <p className="text-[12px] text-muted-foreground">
            Other clients can use{" "}
            <Mono className="text-foreground">{mcpUrl}</Mono> while this dev
            server runs.
          </p>
        )}
      </div>
    </Section>
  );
}
