import { useCallback, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { PackageAnimation } from "./package-animation.js";

const meta: Meta<typeof PackageAnimation> = {
  title: "Powerhouse/Components/PackageAnimation",
  component: PackageAnimation,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
  argTypes: {
    animate: {
      control: "boolean",
      description: "Trigger the animation",
    },
    color: {
      control: "color",
      description: "Stroke color of the SVG frames",
    },
    loop: {
      control: "boolean",
      description: "Loop the animation endlessly",
    },
    size: {
      control: { type: "number", min: 16, max: 256 },
      description: "Icon size in pixels",
    },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    animate: true,
    color: "currentColor",
    size: 32,
  },
};

export const Large: Story = {
  args: {
    animate: true,
    color: "currentColor",
    size: 96,
  },
};

export const CustomColor: Story = {
  args: {
    animate: true,
    color: "#6C63FF",
    size: 64,
  },
};

export const Loop: Story = {
  args: {
    animate: true,
    loop: true,
    color: "currentColor",
    size: 64,
  },
};

export const InstallButton: Story = {
  render: function InstallButtonStory() {
    const [installing, setInstalling] = useState<string | null>(null);

    const packages = [
      {
        name: "@powerhousedao/atlas-scope",
        description: "Atlas Scope document model",
        publisher: "Powerhouse",
      },
      {
        name: "@powerhousedao/budget-statement",
        description: "Budget Statement document model",
        publisher: "Powerhouse",
      },
      {
        name: "@powerhousedao/makerdao-mips",
        description: "MakerDAO MIPs document model",
        publisher: "MakerDAO",
      },
    ];

    const handleInstall = useCallback((name: string) => {
      setInstalling(name);
      setTimeout(() => setInstalling(null), 4000);
    }, []);

    return (
      <div
        style={{
          width: 360,
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          padding: 4,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {packages.map((pkg) => (
          <div
            key={pkg.name}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              borderRadius: 6,
              padding: "6px 8px",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  fontSize: 14,
                  fontWeight: 500,
                  color: "#111827",
                  margin: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {pkg.name}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  margin: 0,
                }}
              >
                {pkg.description}
              </p>
              <p
                style={{
                  fontSize: 12,
                  color: "#9ca3af",
                  margin: 0,
                }}
              >
                {pkg.publisher}
              </p>
            </div>
            {installing === pkg.name ? (
              <PackageAnimation animate loop color="#6b7280" size={48} />
            ) : (
              <button
                onClick={() => handleInstall(pkg.name)}
                style={{
                  flexShrink: 0,
                  borderRadius: 6,
                  backgroundColor: "#111827",
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "white",
                  border: "none",
                  cursor: "pointer",
                }}
                type="button"
              >
                Install
              </button>
            )}
          </div>
        ))}
      </div>
    );
  },
};

export const MissingPackage: Story = {
  render: function MissingPackageStory() {
    const [installing, setInstalling] = useState<string | null>(null);

    const packages = [
      { name: "@powerhousedao/atlas-scope", docType: "AtlasScope" },
      { name: "@powerhousedao/budget-statement", docType: "BudgetStatement" },
    ];

    const handleInstall = useCallback((name: string) => {
      setInstalling(name);
      setTimeout(() => setInstalling(null), 4000);
    }, []);

    return (
      <div
        style={{
          width: 460,
          padding: 24,
          fontFamily: "system-ui, sans-serif",
          color: "#cbd5e1",
        }}
      >
        <div
          style={{
            borderBottom: "1px solid #f8fafc",
            paddingBottom: 8,
            fontSize: 24,
            fontWeight: 700,
            color: "#1e293b",
          }}
        >
          Packages Required
        </div>
        <div style={{ margin: "16px 0", fontSize: 14, color: "#4b5563" }}>
          Documents require packages that are not installed.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {packages.map((pkg) => (
            <div
              key={pkg.name}
              style={{
                borderRadius: 12,
                backgroundColor: "#f8fafc",
                padding: 16,
              }}
            >
              <div
                style={{
                  marginBottom: 4,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#1e293b",
                }}
              >
                {pkg.name}
              </div>
              <div style={{ marginBottom: 12, fontSize: 12, color: "#6b7280" }}>
                Required for document type &ldquo;{pkg.docType}&rdquo;
              </div>
              {installing === pkg.name ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                  }}
                >
                  <PackageAnimation animate loop color="#6b7280" size={48} />
                </div>
              ) : (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    style={{
                      border: "1px solid #e2e8f0",
                      backgroundColor: "white",
                      color: "#1e293b",
                      padding: "6px 16px",
                      borderRadius: 6,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => handleInstall(pkg.name)}
                    style={{
                      border: "none",
                      backgroundColor: "#1e293b",
                      color: "#f9fafb",
                      padding: "6px 16px",
                      borderRadius: 6,
                      fontSize: 14,
                      cursor: "pointer",
                    }}
                  >
                    Install
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  },
};

export const Interactive: Story = {
  render: function InteractiveStory() {
    const [animate, setAnimate] = useState(false);
    const [count, setCount] = useState(0);

    const handleClick = useCallback(() => {
      setAnimate(false);
      requestAnimationFrame(() => {
        setAnimate(true);
      });
    }, []);

    const handleComplete = useCallback(() => {
      setCount((c) => c + 1);
    }, []);

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
        }}
      >
        <PackageAnimation
          animate={animate}
          color="currentColor"
          onComplete={handleComplete}
          size={64}
        />
        <button
          onClick={handleClick}
          style={{
            padding: "8px 16px",
            borderRadius: 6,
            border: "1px solid #ccc",
            cursor: "pointer",
          }}
          type="button"
        >
          Play Animation
        </button>
        <span style={{ fontSize: 14, color: "#888" }}>
          Completed: {count} time{count !== 1 ? "s" : ""}
        </span>
      </div>
    );
  },
};
