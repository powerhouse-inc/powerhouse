FROM node:24-bookworm AS base

WORKDIR /app

# Install socat (for IPv4→IPv6 bridge) early — stable layer, rarely changes
RUN apt-get update -qq && apt-get install -y -qq socat > /dev/null 2>&1 && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm config set @jsr:registry https://npm.jsr.io

# Install ph-cmd (TAG is configurable: "dev", "staging", "latest", or a version like "v6.0.0-dev.149")
ARG TAG=dev
RUN pnpm add -g ph-cmd@$TAG

# ── Stage 1: Scaffold project from published packages (pristine, untouched) ──

RUN case "$TAG" in \
        *dev*) ph init test-project --dev --package-manager pnpm ;; \
        *staging*) ph init test-project --staging --package-manager pnpm ;; \
        *) ph init test-project --package-manager pnpm ;; \
    esac

# Allow build scripts for native deps (pnpm v10 blocks them by default)
# This is the ONLY modification to the ph init project
RUN node -e " \
    const pkg = JSON.parse(require('fs').readFileSync('test-project/package.json','utf8')); \
    pkg.pnpm = pkg.pnpm || {}; \
    pkg.pnpm.onlyBuiltDependencies = ['esbuild','@electric-sql/pglite','@parcel/watcher']; \
    require('fs').writeFileSync('test-project/package.json', JSON.stringify(pkg, null, 2));" && \
    cd test-project && pnpm install

# ── Stage 2: Build test runner (separate from project) ──

# Copy e2e-utils source and build it
COPY e2e-utils/ /app/e2e-utils/
RUN cd /app/e2e-utils && pnpm add -D @playwright/test@^1.55.0 typescript @types/node && \
    echo '{"compilerOptions":{"outDir":"dist","rootDir":".","target":"ESNext","module":"ESNext","moduleResolution":"bundler","declaration":true,"esModuleInterop":true,"strict":true,"skipLibCheck":true},"include":["src"]}' > tsconfig.docker.json && \
    pnpm exec tsc --project tsconfig.docker.json && \
    rm -rf node_modules

# Create test-runner directory with its own package.json
WORKDIR /app/test-runner
RUN pnpm init && pnpm pkg set type=module

# Install test-only dependencies in the test-runner (not in the project)
RUN --mount=type=cache,id=pnpm-test-runner,target=/pnpm/store \
    pnpm add -D \
    @playwright/test@^1.55.0 \
    monocart-coverage-reports@^2.12.8 \
    @powerhousedao/registry@$TAG \
    @powerhousedao/e2e-utils@link:/app/e2e-utils

# Symlink e2e-utils node_modules to test-runner so @playwright/test resolves to single instance
RUN ln -s /app/test-runner/node_modules /app/e2e-utils/node_modules

# Install Playwright chromium + system deps (cached across rebuilds)
RUN --mount=type=cache,id=playwright-browsers,target=/root/.cache/ms-playwright \
    pnpm exec playwright install --with-deps chromium && \
    cp -r /root/.cache/ms-playwright /root/.ms-playwright-cache
# Restore from cache mount (cache mount is not available at runtime)
RUN rm -rf /root/.cache/ms-playwright && mv /root/.ms-playwright-cache /root/.cache/ms-playwright

# Copy test infrastructure (changes frequently — keep last for layer caching)
COPY vetra-e2e/tests/ ./tests/
COPY vetra-e2e/playwright.config.ts ./playwright.config.ts
COPY vetra-e2e/global-setup.ts ./global-setup.ts
COPY vetra-e2e/global-teardown.ts ./global-teardown.ts
COPY vetra-e2e/mcr.config.ts ./mcr.config.ts
COPY vetra-e2e/verdaccio.config.yaml ./verdaccio.config.yaml

# ── Runtime configuration ──

ENV CI=true
ENV DOCKER_E2E=true
# Point test files to the pristine ph init project
ENV PROJECT_DIR="/app/test-project"
# Node 24 in Docker binds servers to IPv6 only; use [::1] for fetch URLs
ENV CONNECT_URL="http://[::1]:3001"
# Reactor port is 4001 in ph init projects (vs 4002 in monorepo)
ENV REACTOR_URL="http://[::1]:4001"
ENV REGISTRY_URL="http://[::1]:8080"
ENV CONSUMER_CONNECT_HOST="[::1]"

# Entrypoint: start socat bridge for registry port, then run tests
CMD socat TCP4-LISTEN:18080,fork,reuseaddr TCP6:[::1]:8080 & \
    pnpm exec playwright test
