# Use Node 22 as the base image
FROM node:22

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set environment for pnpm
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV SHELL=/bin/bash
ENV TAG=latest

CMD ["/app/entrypoint.sh"]
