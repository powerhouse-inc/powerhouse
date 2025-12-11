# Inspector Modal

The Inspector Modal is a development and debugging tool in Connect that provides visibility into the internal state of your application. It allows you to inspect the local database and monitor sync operations with remote servers.

The Inspector Modal has two tabs:

- **Database** - Explore tables and data in the local PGlite database
- **Remotes** - View sync remotes and their channel states (inbox, outbox, dead letter)

## Enabling the Inspector

:::info **Prerequisites**

- Access to a running Connect instance
- Feature flags configured (see below)
  :::

### Required Feature Flags

To use the full Inspector Modal functionality, you need to configure these feature flags:

| Feature Flag                   | Value   | Purpose                              |
| ------------------------------ | ------- | ------------------------------------ |
| `FEATURE_INSPECTOR_ENABLED`    | `true`  | Shows the Inspector button           |
| `FEATURE_LEGACY_READ_ENABLED`  | `false` | Required for Remotes tab to function |
| `FEATURE_LEGACY_WRITE_ENABLED` | `false` | Required for Remotes tab to function |

### Enabling via URL Parameters (Recommended)

The easiest way to enable the Inspector is by adding query parameters to your Connect URL:

```
https://connect-url.xyz/?FEATURE_INSPECTOR_ENABLED=true&FEATURE_LEGACY_READ_ENABLED=false&FEATURE_LEGACY_WRITE_ENABLED=false
```

### Enabling via Environment Variable

For local development, you can set the environment variable before starting Connect:

```bash
PH_CONNECT_INSPECTOR_ENABLED=true npm run dev
```

:::tip
The legacy feature flags (`FEATURE_LEGACY_READ_ENABLED` and `FEATURE_LEGACY_WRITE_ENABLED`) default to `true`. To use the Remotes tab functionality, you must explicitly disable them via URL parameters.
:::

## Accessing the Inspector Modal

Once the feature flags are enabled:

1. Look for the **Inspector button** (ℹ️ icon) in the Connect sidebar footer
2. Click the button to open the Inspector Modal
3. The modal opens with two tabs: **Database** and **Remotes**

<figure className="image-container">
  <img src={require("./images/inspector-button.png").default} alt="Inspector button in sidebar" />
  <figcaption>The Inspector button location in the Connect sidebar footer.</figcaption>
</figure>

## Database Explorer

The Database tab allows you to inspect the local PGlite database that Connect uses to store documents and application data.

<figure className="image-container">
  <img src={require("./images/database-explorer.png").default} alt="Database Explorer interface" />
  <figcaption>The Database Explorer showing the schema tree and table data view.</figcaption>
</figure>

### Understanding the Interface

The Database Explorer is divided into two panels:

- **Left panel (Schema Tree)**: Shows all tables in the `public` schema with their column information
- **Right panel (Table View)**: Displays the data for the selected table with pagination and sorting

### Browsing Tables

1. In the left sidebar, you'll see the schema tree with all available tables
2. Click on a table name to expand it and view its columns
3. Each column shows:
   - Column name
   - Data type (e.g., `varchar`, `boolean`, `integer`)
   - Whether the column is nullable

<figure className="image-container">
  <img src={require("./images/schema-tree.png").default} alt="Schema tree with expanded table" />
  <figcaption>The schema tree showing tables and their column details.</figcaption>
</figure>

### Viewing Table Data

1. Select a table from the schema tree to load its data in the right panel
2. The table view displays all rows with pagination controls at the bottom
3. Use the pagination controls to navigate through large datasets:
   - First page / Previous page
   - Page numbers
   - Next page / Last page
4. Click any column header to sort the data:
   - Click once for ascending order
   - Click again for descending order

<figure className="image-container">
  <img src={require("./images/table-view-pagination.png").default} alt="Table view with pagination" />
  <figcaption>The table data view with pagination controls.</figcaption>
</figure>

### Exporting the Database

To create a backup of your local database:

1. Click the **Export DB** button in the sidebar
2. A complete SQL dump file will be downloaded to your computer
3. The file is named `database-export-{timestamp}.sql`

This export contains the full database schema and all data, which can be useful for debugging or creating backups.

### Importing a Database

:::warning **Data Replacement Warning**
Importing a database will **replace ALL existing data** in your local Connect instance. This action cannot be undone.
:::

To import a database:

1. Click the **Import DB** button in the sidebar
2. Select a `.sql` or `.txt` file containing valid SQL
3. Confirm the replacement in the dialog that appears
4. The database will be cleared and replaced with the imported data
5. The schema tree will refresh automatically to show the new tables

## Remotes Explorer

The Remotes tab allows you to inspect sync remotes and their channel states. This is useful for debugging synchronization issues between your local Connect instance and remote servers.

<figure className="image-container">
  <img src={require("./images/remotes-explorer.png").default} alt="Remotes Explorer interface" />
  <figcaption>The Remotes Explorer showing configured sync remotes.</figcaption>
</figure>

### Understanding Remotes

Sync remotes are connections between your local Connect instance and remote reactors (servers). When you add a remote drive or sync with a cloud service, a remote is created to manage the bidirectional synchronization of document operations.

### Viewing Remote List

The Remotes tab displays a table with all configured sync remotes:

| Column        | Description                                            |
| ------------- | ------------------------------------------------------ |
| ID            | Unique identifier for the remote (truncated)           |
| Name          | Human-readable name of the remote                      |
| Collection ID | The collection this remote is associated with          |
| Filter        | Configuration showing branch, document, or scope filters |
| Channel       | "View" button to inspect the remote's channel state    |

### Inspecting Remote Channels

Click the **View** button on any remote to open the Channel Inspector. The channel shows three mailboxes that track sync operations:

<figure className="image-container">
  <img src={require("./images/channel-inspector.png").default} alt="Channel Inspector with mailboxes" />
  <figcaption>The Channel Inspector showing Inbox, Outbox, and Dead Letter mailboxes.</figcaption>
</figure>

#### Inbox

Operations **received from** the remote server:

| Column      | Description                                          |
| ----------- | ---------------------------------------------------- |
| ID          | Operation identifier                                 |
| Document ID | The document this operation affects                  |
| Branch      | The document branch (usually "main")                 |
| Status      | Current status: Pending (⏳), Applied (✅), Error (❌) |
| Ops Count   | Number of operations in this batch                   |

#### Outbox

Operations **waiting to be sent** to the remote server. Shows the same columns as Inbox.

#### Dead Letter

Operations that **failed to sync** with error information:

| Column      | Description                     |
| ----------- | ------------------------------- |
| ID          | Operation identifier            |
| Document ID | The document this operation affects |
| Branch      | The document branch             |
| Error       | Error message explaining the failure |

## Use Cases

The Inspector Modal is helpful for:

- **Debugging sync issues**: Check the Remotes tab to see if operations are stuck in the inbox/outbox or if there are errors in the dead letter queue
- **Verifying data integrity**: Browse tables to ensure documents are stored correctly
- **Exporting data for backup**: Create SQL dumps of your local database
- **Understanding data flow**: See how operations move between local and remote systems
- **Troubleshooting**: Inspect table schemas and data when debugging application issues
