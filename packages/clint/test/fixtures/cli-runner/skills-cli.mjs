import { defineCli, defineService } from "@powerhousedao/clint";
import { commands } from "./commands.mjs";

// A Cli with a command and a service for the skill build to read; its
// prompts name an agent profile and a skill.
const db = defineService({
  id: "db",
  name: "Database",
  description: "The project's PostgreSQL database",
  command: "pg_ctl start",
});

export const cli = defineCli({
  name: "fixture-skills",
  version: "0.0.1",
  description: "A Cli whose metadata the skill build reads",
  commands,
  services: [db],
  prompts: {
    artifacts: ["dist/skills"],
    agents: { helper: { name: "helper", sections: ["base.md"], skills: [] } },
    skills: { greeting: "Greets people through the hello command" },
  },
});
