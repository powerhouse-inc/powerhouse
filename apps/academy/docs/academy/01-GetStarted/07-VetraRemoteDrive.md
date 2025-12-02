# Vetra Remote Drive Commands

These commands enable collaborative development using Vetra remote drives. Instead of working with local drives only, you can connect your Powerhouse project to a remote drive that syncs across team members.

## Commands Overview

### `ph init --remote-drive`

**Purpose:** Create a new Powerhouse project and connect it to a remote Vetra drive.

**When to use:** You're starting a NEW project that will be shared via a remote drive.

**How it works:**

1. Validates the remote drive URL and checks that no GitHub URL is configured yet
2. Creates a standard Powerhouse project from the boilerplate
3. Adds Vetra configuration to `powerhouse.config.json`:
   ```json
   {
     "vetra": {
       "driveId": "abc123",
       "driveUrl": "https://vetra.example.com/d/abc123"
     }
   }
   ```

**Usage:**
```bash
ph init my-project --remote-drive https://vetra.example.com/d/abc123
```

**After initialization:**
- Create a GitHub repository
- Commit and push your code
- Run `ph vetra` to configure the GitHub URL in the remote drive

---

### `ph checkout --remote-drive`

**Purpose:** Clone an existing Powerhouse project that's already connected to a remote drive.

**When to use:** You're joining an EXISTING project that someone else initialized.

**How it works:**

1. Queries the remote drive to find the configured GitHub URL
2. Clones the repository from GitHub
3. Installs dependencies
4. The project is already configured to use the remote drive

**Usage:**
```bash
ph checkout --remote-drive https://vetra.example.com/d/abc123
```

**Requirements:**
- The remote drive must have a GitHub URL configured (done during `ph vetra` after init)

---

### `ph vetra`

**Purpose:** Start the Vetra development environment with Switchboard and Connect Studio.

**When to use:** After initializing or checking out a project, to start development.

**How it works:**

1. Reads the remote drive URL from `powerhouse.config.json` (or `--remote-drive` flag)
2. Starts Switchboard connected to the remote drive (syncs automatically)
3. Prompts to configure GitHub URL if not set (first time after init)
4. Starts Connect Studio pointing to the drive(s)

**With `--watch` flag:**
- Creates a second "Vetra Preview" drive for testing local changes
- Dynamically loads your local document models and editors
- Main drive stays stable, preview drive for experimentation

**Usage:**
```bash
# Basic usage (uses config from powerhouse.config.json)
ph vetra

# With watch mode for development
ph vetra --watch

# Override remote drive URL
ph vetra --remote-drive https://vetra.example.com/d/abc123

# Disable Connect Studio
ph vetra --disable-connect
```

**Key options:**
- `--watch` - Enable dynamic loading and create preview drive
- `--remote-drive <url>` - Specify remote drive URL
- `--switchboard-port <port>` - Custom Switchboard port (default: 4001)
- `--connect-port <port>` - Custom Connect Studio port (default: 3000)
- `--disable-connect` - Skip Connect Studio
- `--interactive` - Enable interactive mode for code generation

---

## Workflows

### Starting a New Project (Owner)

```bash
# 1. Initialize with remote drive
ph init my-project --remote-drive https://vetra.example.com/d/abc123

# 2. Create GitHub repo and push
cd my-project
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/user/my-project.git
git push -u origin main

# 3. Start Vetra and configure GitHub URL
ph vetra
# (Select option to use detected GitHub URL when prompted)

# 4. Start developing with watch mode
ph vetra --watch
```

### Joining an Existing Project (Collaborator)

```bash
# 1. Checkout from remote drive
ph checkout --remote-drive https://vetra.example.com/d/abc123

# 2. Navigate to project
cd project-name

# 3. Start Vetra environment
ph vetra

# You're now synced with the remote drive
```

---

## Key Concepts

**Remote Drive vs Local Drive:**
- Without remote drive: `ph vetra` creates a local drive on your machine only
- With remote drive: `ph vetra` connects to a shared drive that syncs across team members

**When to use each command:**
- Use `ph init --remote-drive` when starting a NEW project (no GitHub URL configured in drive yet)
- Use `ph checkout --remote-drive` when joining an EXISTING project (GitHub URL already configured)
- Use `ph vetra` to start development after either init or checkout

**Preview Drive (`--watch` mode):**
- Main "Vetra" drive: syncs with remote, contains stable package configuration
- "Vetra Preview" drive: created locally with `--watch`, for testing local document models
- Without `--watch`: safer, prevents untested code from affecting Connect
- With `--watch`: enables rapid development and testing