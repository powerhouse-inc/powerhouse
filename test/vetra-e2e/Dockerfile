FROM node:24-bookworm

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN pnpm config set @jsr:registry https://npm.jsr.io

# Install ph-cmd (TAG is configurable: "dev", "staging", "latest", or a version like "v6.0.0-dev.149")
ARG TAG=dev
RUN pnpm add -g ph-cmd@$TAG

# Scaffold project from published packages
RUN case "$TAG" in \
        *dev*) ph init test-project --dev --package-manager pnpm ;; \
        *staging*) ph init test-project --staging --package-manager pnpm ;; \
        *) ph init test-project --package-manager pnpm ;; \
    esac

WORKDIR /app/test-project

# Allow build scripts for native deps (pnpm v10 blocks them by default)
RUN node -e " \
    const pkg = JSON.parse(require('fs').readFileSync('package.json','utf8')); \
    pkg.pnpm = pkg.pnpm || {}; \
    pkg.pnpm.onlyBuiltDependencies = ['esbuild','@electric-sql/pglite','@parcel/watcher']; \
    require('fs').writeFileSync('package.json', JSON.stringify(pkg, null, 2));" && \
    pnpm install

# Copy e2e-utils (zero runtime deps, @playwright/test peer only)
COPY e2e-utils/ /app/e2e-utils/

# Copy test infrastructure into the scaffolded project
COPY vetra-e2e/tests/ ./tests/
COPY vetra-e2e/playwright.config.ts ./playwright.config.ts
COPY vetra-e2e/global-setup.ts ./global-setup.ts
COPY vetra-e2e/global-teardown.ts ./global-teardown.ts
COPY vetra-e2e/mcr.config.ts ./mcr.config.ts
COPY vetra-e2e/verdaccio.config.yaml ./verdaccio.config.yaml

# Install test-only dependencies
RUN pnpm add -D \
    @playwright/test@^1.55.0 \
    monocart-coverage-reports@^2.12.8 \
    @powerhousedao/registry@$TAG \
    @powerhousedao/e2e-utils@link:/app/e2e-utils

# Build e2e-utils with a standalone tsconfig (the original extends monorepo paths)
# Use rootDir=. so output is dist/src/* matching the package.json exports map
# Then replace e2e-utils node_modules with symlink to test project so @playwright/test
# resolves to a single instance (avoids "Requiring @playwright/test second time" error)
RUN cd /app/e2e-utils && pnpm add -D @playwright/test@^1.55.0 typescript @types/node && \
    echo '{"compilerOptions":{"outDir":"dist","rootDir":".","target":"ESNext","module":"ESNext","moduleResolution":"bundler","declaration":true,"esModuleInterop":true,"strict":true,"skipLibCheck":true},"include":["src"]}' > tsconfig.docker.json && \
    pnpm exec tsc --project tsconfig.docker.json && \
    rm -rf node_modules && \
    ln -s /app/test-project/node_modules /app/e2e-utils/node_modules

# Install Playwright chromium + system deps
RUN pnpm exec playwright install --with-deps chromium

ENV CI=true
ENV DOCKER_E2E=true
# Node 24 in Docker binds servers to IPv6 only; use [::1] for fetch URLs
ENV CONNECT_URL="http://[::1]:3001"
# Reactor port is 4001 in ph init projects (vs 4002 in monorepo)
ENV REACTOR_URL="http://[::1]:4001"
ENV REGISTRY_URL="http://[::1]:8080"
ENV CONSUMER_CONNECT_HOST="[::1]"

# Install socat to bridge IPv4→IPv6 for tools that can't handle [::1] URLs (e.g. ph-cli publish)
RUN apt-get update -qq && apt-get install -y -qq socat > /dev/null 2>&1 && rm -rf /var/lib/apt/lists/*

# Entrypoint: start socat bridge for registry port, then run tests
CMD socat TCP4-LISTEN:18080,fork,reuseaddr TCP6:[::1]:8080 & \
    pnpm exec playwright test
