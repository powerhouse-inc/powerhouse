import { beforeAll } from "bun:test";
import { generateTestProjects } from "./generate-test-projects.js";

beforeAll(async () => {
  await generateTestProjects();
});
