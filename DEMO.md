# Vetra Demo Guide

This guide demonstrates how to use Vetra for automated code generation from visual document models and editors.

## Prerequisites

- Node.js >=22
- pnpm installed
- Powerhouse CLI (`ph` command) installed

## Part 1: Initial Setup

### 1. Clone and Build Monorepo
```bash
git clone https://github.com/powerhouse-inc/powerhouse.git -b feat/vetra-package-documents
cd powerhouse
pnpm build:all
```

### 2. Create First Project
In a different directory:
```bash
ph init my-project --dev
cd my-project
```

### 3. Link Local Dependencies
```bash
ph use local /path/to/the/monorepo
```

### 4. Start Vetra
```bash
ph vetra
```
Keep this terminal running - Vetra will watch for changes.

## Part 2: Creating Documents in Connect

### 5. Open Connect Interface
Navigate to http://localhost:3000 in your browser

### 6. Access Vetra Drive
Open the Vetra drive from Connect

### 7. Create Package Manifest
- Click "New Package Manifest"
- Fill in required fields:
  - Package name
  - Description
  - Category
  - Version
- Watch terminal for manifest codegen logs
- Verify: Check `powerhouse.manifest.json` file for updates

### 8. Create Document Model
- In Vetra drive, create "New Document Model"
- Complete all header fields:
  - **Document Type**
  - **Model Description**
  - **Author Name**
  - **Website URL**
  - **Model Extension**
  - **Global State Schema**
  - **Global State Initial Value**
- Add at least one module with one operation
- Verify: Check `document-models/` directory for auto-generated model

### 9. Create Document Editor
- In Vetra drive, create "New Document Editor"
- Configure:
  - **Name**: Editor display name
  - **ID**: Editor ID
  - **Document Type**: Must match the document type from step 8
- Verify: Check `editors/` folder for generated editor code

## Part 3: Multi-Project Synchronization

### 10. Create Second Project
In a new directory:
```bash
ph init my-project-2 --dev
cd my-project-2
ph use local /path/to/the/monorepo
```

### 11. Connect to Existing Vetra Drive
```bash
ph vetra --remote-drive http://localhost:4001/d/vetra --connect-port 3003 --reactor-port 4005
```

> **Important**: Ensure the first Vetra instance (from step 4) is still running

### 12. Verify Synchronization
- The same editor, document model, and manifest will be auto-generated in the second project
- Make changes in Connect's Vetra drive
- Observe changes propagating to both projects in real-time
