import { describe, expect, test } from "vitest";
import { connectEntrypointTemplate } from "../../templates/boilerplate/docker/connect-entrypoint.sh.js";
import { dockerfileTemplate } from "../../templates/boilerplate/docker/Dockerfile.js";
import { nginxConfTemplate } from "../../templates/boilerplate/docker/nginx.conf.js";
import { switchboardEntrypointTemplate } from "../../templates/boilerplate/docker/switchboard-entrypoint.sh.js";
import { syncAndPublishWorkflowTemplate } from "../../templates/boilerplate/github/sync-and-publish.yml.js";

describe("CI/CD Templates", () => {
  describe("sync-and-publish.yml", () => {
    test("should be a non-empty string", () => {
      expect(typeof syncAndPublishWorkflowTemplate).toBe("string");
      expect(syncAndPublishWorkflowTemplate.length).toBeGreaterThan(0);
    });

    test("should have correct workflow name", () => {
      expect(syncAndPublishWorkflowTemplate).toContain(
        "name: Sync and Publish",
      );
    });

    test("should contain required jobs", () => {
      expect(syncAndPublishWorkflowTemplate).toContain("prepare:");
      expect(syncAndPublishWorkflowTemplate).toContain("update-and-publish:");
      expect(syncAndPublishWorkflowTemplate).toContain("build-docker:");
      expect(syncAndPublishWorkflowTemplate).toContain("summary:");
    });

    test("should have workflow_dispatch trigger with channel options", () => {
      expect(syncAndPublishWorkflowTemplate).toContain("workflow_dispatch:");
      expect(syncAndPublishWorkflowTemplate).toContain("- dev");
      expect(syncAndPublishWorkflowTemplate).toContain("- staging");
      expect(syncAndPublishWorkflowTemplate).toContain("- latest");
    });

    test("should have repository_dispatch trigger", () => {
      expect(syncAndPublishWorkflowTemplate).toContain("repository_dispatch:");
      expect(syncAndPublishWorkflowTemplate).toContain("powerhouse-release");
    });

    test("should configure Docker and GHCR registries", () => {
      expect(syncAndPublishWorkflowTemplate).toContain("DOCKER_REGISTRY:");
      expect(syncAndPublishWorkflowTemplate).toContain("GHCR_REGISTRY:");
      expect(syncAndPublishWorkflowTemplate).toContain("cr.vetra.io");
      expect(syncAndPublishWorkflowTemplate).toContain("ghcr.io");
    });
  });

  describe("Dockerfile", () => {
    test("should be a non-empty string", () => {
      expect(typeof dockerfileTemplate).toBe("string");
      expect(dockerfileTemplate.length).toBeGreaterThan(0);
    });

    test("should contain base stage", () => {
      expect(dockerfileTemplate).toContain("FROM node:24-alpine AS base");
    });

    test("should contain connect-builder stage", () => {
      expect(dockerfileTemplate).toContain("FROM base AS connect-builder");
    });

    test("should contain connect final stage", () => {
      expect(dockerfileTemplate).toContain("FROM nginx:alpine AS connect");
    });

    test("should contain switchboard final stage", () => {
      expect(dockerfileTemplate).toContain(
        "FROM node:24-alpine AS switchboard",
      );
    });

    test("should configure pnpm", () => {
      expect(dockerfileTemplate).toContain("corepack enable");
      expect(dockerfileTemplate).toContain("PNPM_HOME");
    });

    test("should install ph-cmd", () => {
      expect(dockerfileTemplate).toContain("ph-cmd@$TAG");
    });

    test("should have health checks", () => {
      expect(dockerfileTemplate).toContain("HEALTHCHECK");
    });
  });

  describe("nginx.conf", () => {
    test("should be a non-empty string", () => {
      expect(typeof nginxConfTemplate).toBe("string");
      expect(nginxConfTemplate.length).toBeGreaterThan(0);
    });

    test("should contain health check endpoint", () => {
      expect(nginxConfTemplate).toContain("location /health");
    });

    test("should configure gzip compression", () => {
      expect(nginxConfTemplate).toContain("gzip on");
    });

    test("should use PORT environment variable", () => {
      expect(nginxConfTemplate).toContain("${PORT}");
    });

    test("should configure caching for assets", () => {
      expect(nginxConfTemplate).toContain("Cache-Control");
      expect(nginxConfTemplate).toContain("/assets/");
    });
  });

  describe("connect-entrypoint.sh", () => {
    test("should be a non-empty string", () => {
      expect(typeof connectEntrypointTemplate).toBe("string");
      expect(connectEntrypointTemplate.length).toBeGreaterThan(0);
    });

    test("should start with shebang", () => {
      expect(connectEntrypointTemplate).toMatch(/^#!/);
    });

    test("should use envsubst for nginx config", () => {
      expect(connectEntrypointTemplate).toContain("envsubst");
    });

    test("should start nginx", () => {
      expect(connectEntrypointTemplate).toContain("nginx");
    });
  });

  describe("switchboard-entrypoint.sh", () => {
    test("should be a non-empty string", () => {
      expect(typeof switchboardEntrypointTemplate).toBe("string");
      expect(switchboardEntrypointTemplate.length).toBeGreaterThan(0);
    });

    test("should start with shebang", () => {
      expect(switchboardEntrypointTemplate).toMatch(/^#!/);
    });

    test("should start switchboard", () => {
      expect(switchboardEntrypointTemplate).toContain("ph switchboard");
    });
  });
});
