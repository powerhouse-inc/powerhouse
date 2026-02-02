import { yaml } from "@tmpl/core";

export const syncAndPublishWorkflowTemplate = yaml`
name: Sync and Publish

on:
  # Triggered by powerhouse monorepo after release
  repository_dispatch:
    types: [powerhouse-release]

  # Manual trigger
  workflow_dispatch:
    inputs:
      channel:
        description: 'Release channel'
        required: true
        type: choice
        options:
          - dev
          - staging
          - latest
        default: 'staging'
      version:
        description: 'Powerhouse version (e.g., 5.3.0-staging.6)'
        required: false
        type: string
      dry-run:
        description: 'Dry run (skip publishing)'
        required: false
        type: boolean
        default: false
      skip-docker:
        description: 'Skip Docker build and push'
        required: false
        type: boolean
        default: false

env:
  NODE_VERSION: '24'
  PNPM_VERSION: '10'

jobs:
  # ==========================================================================
  # Determine release parameters
  # ==========================================================================
  prepare:
    name: Prepare Release
    runs-on: ubuntu-latest
    outputs:
      channel: \${{ steps.params.outputs.channel }}
      version: \${{ steps.params.outputs.version }}
      branch: \${{ steps.params.outputs.branch }}
      project_name: \${{ steps.params.outputs.project_name }}
      docker_registry: \${{ steps.params.outputs.docker_registry }}
      dry_run: \${{ steps.params.outputs.dry_run }}
      skip_docker: \${{ steps.params.outputs.skip_docker }}
    steps:
      - name: Determine parameters
        id: params
        run: |
          # Get channel from dispatch payload or input
          if [ "\${{ github.event_name }}" = "repository_dispatch" ]; then
            CHANNEL="\${{ github.event.client_payload.channel }}"
            VERSION="\${{ github.event.client_payload.version }}"
            DRY_RUN="false"
            SKIP_DOCKER="false"
          else
            CHANNEL="\${{ inputs.channel }}"
            VERSION="\${{ inputs.version }}"
            DRY_RUN="\${{ inputs.dry-run }}"
            SKIP_DOCKER="\${{ inputs.skip-docker }}"
          fi

          # Default channel to staging if not set
          CHANNEL="\${CHANNEL:-staging}"

          # Determine branch from channel
          case "\$CHANNEL" in
            dev) BRANCH="dev" ;;
            staging) BRANCH="staging" ;;
            latest|main) BRANCH="main" ;;
            *) BRANCH="staging" ;;
          esac

          # Use DOCKER_PROJECT secret if set, otherwise extract from repository name
          if [ -n "\${{ secrets.DOCKER_PROJECT }}" ]; then
            PROJECT_NAME="\${{ secrets.DOCKER_PROJECT }}"
          else
            PROJECT_NAME="\${GITHUB_REPOSITORY#*/}"
          fi

          # Use DOCKER_REGISTRY secret if set, otherwise default to cr.vetra.io
          if [ -n "\${{ secrets.DOCKER_REGISTRY }}" ]; then
            DOCKER_REGISTRY="\${{ secrets.DOCKER_REGISTRY }}"
          else
            DOCKER_REGISTRY="cr.vetra.io"
          fi

          echo "channel=\$CHANNEL" >> \$GITHUB_OUTPUT
          echo "version=\$VERSION" >> \$GITHUB_OUTPUT
          echo "branch=\$BRANCH" >> \$GITHUB_OUTPUT
          echo "project_name=\$PROJECT_NAME" >> \$GITHUB_OUTPUT
          echo "docker_registry=\$DOCKER_REGISTRY" >> \$GITHUB_OUTPUT
          echo "dry_run=\$DRY_RUN" >> \$GITHUB_OUTPUT
          echo "skip_docker=\$SKIP_DOCKER" >> \$GITHUB_OUTPUT

          echo "Channel: \$CHANNEL"
          echo "Version: \$VERSION"
          echo "Branch: \$BRANCH"
          echo "Project: \$PROJECT_NAME"
          echo "Docker Registry: \$DOCKER_REGISTRY"
          echo "Dry Run: \$DRY_RUN"
          echo "Skip Docker: \$SKIP_DOCKER"

  # ==========================================================================
  # Update dependencies and publish to npm
  # ==========================================================================
  update-and-publish:
    name: Update & Publish NPM
    needs: prepare
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
    outputs:
      new_version: \${{ steps.version.outputs.new_version }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: \${{ needs.prepare.outputs.branch }}
          fetch-depth: 0
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Install pnpm
        uses: pnpm/action-setup@v4
        with:
          version: \${{ env.PNPM_VERSION }}

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Configure git
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"

      - name: Install ph-cli
        run: |
          CHANNEL="\${{ needs.prepare.outputs.channel }}"
          case "\$CHANNEL" in
            dev) pnpm add -g @powerhousedao/ph-cli@dev ;;
            staging) pnpm add -g @powerhousedao/ph-cli@staging ;;
            *) pnpm add -g @powerhousedao/ph-cli@latest ;;
          esac

      - name: Update Powerhouse dependencies
        run: ph update

      - name: Install dependencies
        run: pnpm install

      - name: Build package
        run: pnpm build

      - name: Run tests
        run: pnpm test || true
        continue-on-error: true

      - name: Bump version
        id: version
        run: |
          CHANNEL="\${{ needs.prepare.outputs.channel }}"
          CURRENT_VERSION=\$(node -p "require('./package.json').version")

          # Determine new version
          if [ "\$CHANNEL" = "latest" ] || [ "\$CHANNEL" = "main" ]; then
            # For production, use patch bump
            npm version patch --no-git-tag-version
          else
            # For dev/staging, use prerelease
            npm version prerelease --preid=\$CHANNEL --no-git-tag-version
          fi

          NEW_VERSION=\$(node -p "require('./package.json').version")
          echo "new_version=\$NEW_VERSION" >> \$GITHUB_OUTPUT
          echo "Bumped version: \$CURRENT_VERSION -> \$NEW_VERSION"

      - name: Commit changes
        run: |
          git add package.json pnpm-lock.yaml
          git commit -m "chore: sync powerhouse dependencies to \${{ needs.prepare.outputs.version }}

          - Updated to powerhouse \${{ needs.prepare.outputs.version }}
          - Bumped version to \${{ steps.version.outputs.new_version }}" || echo "No changes to commit"

      - name: Push changes
        if: needs.prepare.outputs.dry_run != 'true'
        run: git push

      - name: Setup npm for publishing
        if: needs.prepare.outputs.dry_run != 'true'
        uses: actions/setup-node@v4
        with:
          node-version: \${{ env.NODE_VERSION }}
          registry-url: 'https://registry.npmjs.org'

      - name: Publish to npm with provenance
        if: needs.prepare.outputs.dry_run != 'true' && env.NPM_ACCESS_TOKEN != ''
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_ACCESS_TOKEN }}
          NPM_ACCESS_TOKEN: \${{ secrets.NPM_ACCESS_TOKEN }}
          NPM_CONFIG_PROVENANCE: true
        run: |
          CHANNEL="\${{ needs.prepare.outputs.channel }}"
          if [ "\$CHANNEL" = "latest" ] || [ "\$CHANNEL" = "main" ]; then
            pnpm publish --access public --tag latest --no-git-checks
          else
            pnpm publish --access public --tag \$CHANNEL --no-git-checks
          fi

      - name: Create git tag
        if: needs.prepare.outputs.dry_run != 'true'
        run: |
          git tag "v\${{ steps.version.outputs.new_version }}"
          git push origin "v\${{ steps.version.outputs.new_version }}"

  # ==========================================================================
  # Build and push Docker images
  # ==========================================================================
  build-docker:
    name: Build Docker Images
    needs: [prepare, update-and-publish]
    if: needs.prepare.outputs.skip_docker != 'true' && needs.prepare.outputs.dry_run != 'true'
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    strategy:
      matrix:
        target: [connect, switchboard]
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          ref: \${{ needs.prepare.outputs.branch }}

      - name: Pull latest changes
        run: git pull origin \${{ needs.prepare.outputs.branch }}

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to Docker Registry
        uses: docker/login-action@v3
        with:
          registry: \${{ needs.prepare.outputs.docker_registry }}
          username: \${{ secrets.DOCKER_USERNAME || github.actor }}
          password: \${{ secrets.DOCKER_PASSWORD || secrets.GITHUB_TOKEN }}

      - name: Extract package name
        id: package
        run: |
          PACKAGE_NAME=\$(node -p "require('./package.json').name")
          echo "name=\$PACKAGE_NAME" >> \$GITHUB_OUTPUT

      - name: Determine image tags
        id: tags
        run: |
          VERSION="\${{ needs.update-and-publish.outputs.new_version }}"
          CHANNEL="\${{ needs.prepare.outputs.channel }}"
          PROJECT="\${{ needs.prepare.outputs.project_name }}"
          TARGET="\${{ matrix.target }}"
          REGISTRY="\${{ needs.prepare.outputs.docker_registry }}"

          # Determine the image base path
          if [ "\$REGISTRY" = "ghcr.io" ]; then
            # GHCR uses owner/project structure
            IMAGE_BASE="\${REGISTRY}/\${{ github.repository_owner }}/\${PROJECT}/\${TARGET}"
          else
            # Other registries use project/image structure
            IMAGE_BASE="\${REGISTRY}/\${PROJECT}/\${TARGET}"
          fi

          # Build tag list
          TAGS="\${IMAGE_BASE}:v\${VERSION}"

          # Add channel tag
          if [ "\$CHANNEL" = "latest" ] || [ "\$CHANNEL" = "main" ]; then
            TAGS="\${TAGS},\${IMAGE_BASE}:latest"
          else
            TAGS="\${TAGS},\${IMAGE_BASE}:\${CHANNEL}"
          fi

          echo "tags=\$TAGS" >> \$GITHUB_OUTPUT
          echo "Image tags: \$TAGS"

      - name: Build and push \${{ matrix.target }}
        uses: docker/build-push-action@v5
        with:
          context: .
          file: ./Dockerfile
          target: \${{ matrix.target }}
          push: true
          tags: \${{ steps.tags.outputs.tags }}
          build-args: |
            TAG=\${{ needs.prepare.outputs.channel == 'latest' && 'latest' || needs.prepare.outputs.version }}
            PACKAGE_NAME=\${{ steps.package.outputs.name }}
            PH_CONNECT_BASE_PATH=/
          cache-from: type=gha
          cache-to: type=gha,mode=max

  # ==========================================================================
  # Summary
  # ==========================================================================
  summary:
    name: Release Summary
    needs: [prepare, update-and-publish, build-docker]
    if: always()
    runs-on: ubuntu-latest
    steps:
      - name: Summary
        run: |
          echo "## Release Summary" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "| Parameter | Value |" >> \$GITHUB_STEP_SUMMARY
          echo "|-----------|-------|" >> \$GITHUB_STEP_SUMMARY
          echo "| Channel | \${{ needs.prepare.outputs.channel }} |" >> \$GITHUB_STEP_SUMMARY
          echo "| Branch | \${{ needs.prepare.outputs.branch }} |" >> \$GITHUB_STEP_SUMMARY
          echo "| Powerhouse Version | \${{ needs.prepare.outputs.version }} |" >> \$GITHUB_STEP_SUMMARY
          echo "| Package Version | \${{ needs.update-and-publish.outputs.new_version }} |" >> \$GITHUB_STEP_SUMMARY
          echo "| Docker Registry | \${{ needs.prepare.outputs.docker_registry }} |" >> \$GITHUB_STEP_SUMMARY
          echo "| Dry Run | \${{ needs.prepare.outputs.dry_run }} |" >> \$GITHUB_STEP_SUMMARY
          echo "" >> \$GITHUB_STEP_SUMMARY
          echo "### Docker Images" >> \$GITHUB_STEP_SUMMARY
          echo "- \\\`\${{ needs.prepare.outputs.docker_registry }}/\${{ needs.prepare.outputs.project_name }}/connect:v\${{ needs.update-and-publish.outputs.new_version }}\\\`" >> \$GITHUB_STEP_SUMMARY
          echo "- \\\`\${{ needs.prepare.outputs.docker_registry }}/\${{ needs.prepare.outputs.project_name }}/switchboard:v\${{ needs.update-and-publish.outputs.new_version }}\\\`" >> \$GITHUB_STEP_SUMMARY
`.raw;
