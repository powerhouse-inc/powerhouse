# Switchboard

A powerful document-driven server that provides a unified API for managing and serving document models, drives, and reactors in the Powerhouse ecosystem.

## 🚀 Features

- **Document Model Management**: Serve and manage document models with GraphQL API
- **Document Drive Support**: Handle document drives with filesystem and PostgreSQL storage
- **Reactor Integration**: Built-in support for Powerhouse reactors
- **Flexible Storage**: Support for filesystem, PostgreSQL, and Redis caching
- **Docker Ready**: Containerized deployment with comprehensive environment configuration
- **Authentication**: Configurable authentication with guest, user, and admin roles
- **HTTPS Support**: Built-in HTTPS server with custom certificates
- **Profiling**: Integration with Pyroscope for performance monitoring
- **Error Tracking**: Sentry integration for error monitoring and reporting

## 📦 Installation

### Prerequisites

- Node.js 22+
- pnpm (recommended) or npm
- Redis (optional, for caching)
- PostgreSQL (optional, for persistent storage)

### Local Development

```bash
# Clone the repository
git clone https://github.com/powerhouse-inc/powerhouse.git
cd powerhouse

# Install dependencies
pnpm install

# Build the switchboard
pnpm --filter @powerhousedao/switchboard build

# Start in development mode
pnpm --filter @powerhousedao/switchboard dev
```

### Local Development (PostgreSQL)

1. **Start the PostgreSQL database using reactor's Docker Compose:**

```bash
# From the repository root, start the database
docker compose -f packages/reactor/docker-compose.yml up -d
```

This starts:
- PostgreSQL on port `5433` (mapped from container port 5432)
- Adminer (database UI) on port `8080`

2. **Run database migrations:**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/reactor" pnpm migrate
```

3. **Start switchboard with the PostgreSQL database URL:**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/reactor" pnpm start
```

4. **(Optional) Access the database UI:**
   - Open http://localhost:8080
   - System: PostgreSQL
   - Server: postgres
   - Username: postgres
   - Password: postgres
   - Database: reactor

5. **(Optional) Stop the Database**

```bash
docker compose -f packages/reactor/docker-compose.yml down

# To also remove the data volume:
docker compose -f packages/reactor/docker-compose.yml down -v
```

### Global Installation

```bash
# Install globally
npm install -g @powerhousedao/switchboard

# Or using pnpm
pnpm add -g @powerhousedao/switchboard
```

## 🏃‍♂️ Quick Start


## ⚙️ Configuration

### Environment Variables

| Variable                     | Description                        | Default               |
| ---------------------------- | ---------------------------------- | --------------------- |
| `PORT`                       | Server port                        | `4001`                |
| `DATABASE_URL`               | Database connection string         | `./.ph/drive-storage` |
| `PH_REACTOR_DATABASE_URL`    | PostgreSQL URL (takes precedence)  | -                     |
| `REDIS_URL`                  | Redis connection URL               | -                     |
| `REDIS_TLS_URL`              | Redis TLS connection URL           | -                     |
| `SENTRY_DSN`                 | Sentry DSN for error tracking      | -                     |
| `SENTRY_ENV`                 | Sentry environment                 | -                     |
| `PYROSCOPE_SERVER_ADDRESS`   | Pyroscope server address           | -                     |
| `FEATURE_REACTORV2_ENABLED`  | Enable Reactor v2 subgraph feature | `false`               |

### Authentication Configuration

```typescript
const options = {
  auth: {
    enabled: true,
    guests: ["0x123", "0x456"],
    users: ["0x789", "0xabc"],
    admins: ["0xdef", "0xghi"],
  },
};
```

### Storage Options

Switchboard supports multiple storage backends:

- **Filesystem**: Local file-based storage (default)
- **PostgreSQL**: Persistent database storage
- **Redis**: Caching layer (optional)

## 🐳 Docker Deployment

### Using Docker Compose

```yaml
version: "3.8"
services:
  switchboard:
    image: powerhouse/switchboard:latest
    ports:
      - "4001:4001"
    environment:
      - PORT=4001
      - DATABASE_URL=postgresql://user:pass@db:5432/switchboard
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: switchboard
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass

  redis:
    image: redis:7-alpine
```

### Environment Variables for Docker

```bash
# Database
PH_SWITCHBOARD_DATABASE_URL="postgresql://user:pass@db:5432/switchboard"
PH_SWITCHBOARD_REDIS_URL="redis://redis:6379"

# Authentication
PH_SWITCHBOARD_AUTH_ENABLED=true
PH_SWITCHBOARD_ADMINS_LIST="0x123,0x456"
PH_SWITCHBOARD_USERS_LIST="0x789,0xabc"
PH_SWITCHBOARD_GUESTS_LIST="0xdef,0xghi"

# Packages
PH_PACKAGES="package1,package2,package3"
```

## 🔧 Development

### Project Structure

```
src/
├── index.ts          # Main entry point
├── server.ts         # Server implementation
├── config.ts         # Configuration management
├── types.ts          # TypeScript type definitions
├── utils.ts          # Utility functions
├── profiler.ts       # Profiling integration
├── install-packages.ts # Package installation
└── clients/          # External client integrations
    └── redis.ts      # Redis client
```

### Available Scripts

```bash
# Build the project
pnpm build

# Start in development mode
pnpm dev

# Start production server
pnpm start

# Run database migrations (PostgreSQL only)
pnpm migrate

# Check migration status
pnpm migrate:status

# Lint code
pnpm lint

# Clean build artifacts
pnpm clean
```

### Database Migrations

Switchboard uses Kysely for database migrations when running with PostgreSQL. Migrations are handled differently depending on your storage backend:

- **PGlite (default)**: Migrations run automatically on startup
- **PostgreSQL**: Migrations can be run manually or as part of your deployment pipeline

#### Running Migrations

```bash
# Via pnpm scripts (from apps/switchboard directory)
DATABASE_URL="postgresql://user:pass@localhost:5432/db" pnpm migrate

# Check which migrations have been applied
DATABASE_URL="postgresql://user:pass@localhost:5432/db" pnpm migrate:status

# Via ph CLI (from anywhere)
ph switchboard --db-path postgresql://user:pass@localhost:5432/db --migrate
ph switchboard --db-path postgresql://user:pass@localhost:5432/db --migrate-status
```

#### Environment Variables for Migrations

The migration commands check for a PostgreSQL URL in this order:
1. `PH_REACTOR_DATABASE_URL`
2. `DATABASE_URL`
3. Config file (`powerhouse.config.json` -> `switchboard.database.url`)

If no PostgreSQL URL is found, migrations are skipped with a message (PGlite handles migrations automatically).

#### CI/CD Integration

For production deployments, run migrations before starting the server:

```bash
# Run migrations then start
ph switchboard --migrate && ph switchboard

# Or with pnpm
pnpm migrate && pnpm start
```

### Adding New Features

1. **Document Models**: Add new document model modules to the reactor builder
2. **Storage Backends**: Implement new storage adapters
3. **Authentication**: Extend authentication logic
4. **API Endpoints**: Add new GraphQL resolvers

## 📚 API Reference

### GraphQL Endpoints

Switchboard exposes a GraphQL API for document operations:

- **Document Models**: Query and mutate document models
- **Document Drives**: Manage document drives
- **Reactor Operations**: Execute reactor operations

### REST Endpoints

- `GET /health` - Health check endpoint
- `POST /graphql` - GraphQL endpoint
- `GET /graphql` - GraphQL playground (development)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [Powerhouse Docs](https://docs.powerhouse.com)
- **Issues**: [GitHub Issues](https://github.com/powerhouse-inc/powerhouse/issues)
- **Discussions**: [GitHub Discussions](https://github.com/powerhouse-inc/powerhouse/discussions)

## 🔗 Related Projects

- [@powerhousedao/reactor-api](https://github.com/powerhouse-inc/powerhouse/tree/main/packages/reactor-api) - Reactor API package
- [@powerhousedao/document-drive](https://github.com/powerhouse-inc/powerhouse/tree/main/packages/document-drive) - Document drive management
- [@powerhousedao/document-model](https://github.com/powerhouse-inc/powerhouse/tree/main/packages/document-model) - Document model system
