import {
  connectEntrypointTemplate,
  dockerfileTemplate,
  nginxConfTemplate,
  switchboardEntrypointTemplate,
  vetraWorkflowTemplate,
} from "@powerhousedao/codegen/templates";
import { describe, expect, test } from "bun:test";

describe("CI/CD Templates", () => {
  describe("vetra.yml", () => {
    test("should be a non-empty string", () => {
      expect(typeof vetraWorkflowTemplate).toBe("string");
      expect(vetraWorkflowTemplate.length).toBeGreaterThan(0);
    });

    test("should have correct workflow name", () => {
      expect(vetraWorkflowTemplate).toContain("name: Vetra");
    });

    test("should document how to set up the App and the guide link", () => {
      expect(vetraWorkflowTemplate).toContain("https://vetra.io/user/apps/new");
      expect(vetraWorkflowTemplate).toContain("VETRA_APP_ID");
      expect(vetraWorkflowTemplate).toContain("https://vetra.io/docs/deploy");
    });

    test("should run on push to main, version tags, and pull requests", () => {
      expect(vetraWorkflowTemplate).toContain("branches: [main]");
      expect(vetraWorkflowTemplate).toContain('tags: ["v*"]');
      expect(vetraWorkflowTemplate).toContain(
        "types: [opened, synchronize, reopened]",
      );
    });

    test("should request an OIDC token and skip forked PRs", () => {
      expect(vetraWorkflowTemplate).toContain("id-token: write");
      expect(vetraWorkflowTemplate).toContain(
        "if: github.event.pull_request.head.repo.fork != true",
      );
    });

    test("should deploy via the vetra-deploy-action with the app-id variable", () => {
      expect(vetraWorkflowTemplate).toContain(
        "uses: powerhouse-inc/vetra-deploy-action@v1",
      );
      expect(vetraWorkflowTemplate).toContain(
        "app-id: ${{ vars.VETRA_APP_ID }}",
      );
    });

    test("should keep the literal GitHub Actions expression syntax intact", () => {
      expect(vetraWorkflowTemplate).toContain(
        "group: vetra-${{ github.event.pull_request.number || github.ref }}",
      );
      expect(vetraWorkflowTemplate).not.toContain("\\${{");
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
