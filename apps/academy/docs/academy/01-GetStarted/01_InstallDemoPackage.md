# Install the Demo Package

:::tip
To give you a quick idea of how the Powerhouse ecosystem operates on document models and packages, why don't you try installing a package?   

Let's get started by installing the Powerhouse command-line tool `ph-cmd` and then using it to install a pre-built demo package with document models & editors. 
:::

## Powerhouse CLI

You'll use the Powerhouse CLI to launch a local environment with a "Contributor Billing" package. This package demonstrates how you might track and bill for contributions in a project.

### Step 1: Install `ph-cmd`

First, you need the Powerhouse command-line interface. Open your terminal and run the installation command :

```bash
pnpm install -g ph-cmd
```

Verify the installation:

```bash
ph-cmd --version
```                                                   

### Step 2: Install the Contributor Billing Package

Now, use `ph` to install the demo package into a globals project.

```bash
# Install the package
ph install contributor-billing
```

This command downloads and sets up the Contributor Billing package, making its features available in your Powerhouse environment.

You've now successfully installed `ph-cmd` and added your first package! To run the package locally in Connect, our collaboration & contributor app, you run the `ph connect` command. 
