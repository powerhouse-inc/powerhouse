# Referencing Monorepo Packages

## **Context**

In scenarios where a project is not part of the monorepo but needs to reference monorepo packages (e.g., using `@powerhousedeao/ph-cli`), there's a streamlined approach that avoids duplicating dependencies and maintains consistency with monorepo versions.

---

## **Approach**

### **1. Using `link:` in `package.json`**

Instead of manually copying dependencies or trying complex build setups, you can use the `link:` protocol to create a symlink to the monorepo package.

```json
{
  "dependencies": {
    "@powerhousedeao/ph-cli": "link:../monorepo/clis/ph-cli"
  }
}
```

This approach creates a symlink under the node_modules directory, linking directly to the specified monorepo package.

### **2. Running the Linked CLI**

After linking, you can run the CLI tool using pnpm:

```bash
pnpm install
pnpm run ../powerhouse/clis/ph-cli
```

Alternatively, use the command through the linked CLI:

```bash
ph connect
```

This will invoke the connect package from the monorepo.

### **3. Building Dependencies**

To ensure all dependencies are correctly built:

```bash
nx run @powerhousedeao/ph-cli
```

This command will build all necessary dependencies within the monorepo.

### **4. Key Insights**

- **Symlink Simplicity:** The link: protocol is the least disruptive, as it avoids version conflicts and unnecessary duplication.
- **Development Workflow:** Changes made to the connect code in the monorepo will be picked up automatically when using the linked CLI, as ph-cli defers calls to the respective packages.

### **5. Troubleshooting**

If dependencies aren't picked up correctly: Ensure the symlink path is accurate relative to the project root.

For isolated package builds: Use nx run to trigger specific package builds when needed.

### **6. Conclusion**
Using link: is an effective, developer-friendly method to reference monorepo packages in external boilerplate projects. It supports efficient development workflows, reduces redundancy, and ensures consistency across environments.

