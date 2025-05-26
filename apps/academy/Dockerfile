# syntax=docker/dockerfile:1

# Stage 1: Base image.
## Start with a base image containing NodeJS so we can build Docusaurus.
FROM node:lts AS base
## Disable colour output from yarn to make logs easier to read.
ENV FORCE_COLOR=0
## Enable corepack.
RUN corepack enable
## Set the working directory to `/opt/docusaurus`.
WORKDIR /opt/docusaurus

# Stage 2b: Production build mode.
FROM base AS prod
## Set the working directory to `/opt/docusaurus`.
WORKDIR /opt/docusaurus
## Copy over the source code.
COPY . /opt/docusaurus/
## Install dependencies with `--frozen-lockfile` to ensure reproducibility.
RUN pnpm install --frozen-lockfile
## Build the static site.
RUN pnpm build

# Stage 3a: Serve with `docusaurus serve`.
FROM prod AS serve
## Expose the port that Docusaurus will run on.
ENV PORT=3000
EXPOSE $PORT
## Run the production server.
ENTRYPOINT pnpm serve --host 0.0.0.0 --no-open --port $PORT

