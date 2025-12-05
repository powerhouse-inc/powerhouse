import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RenownAuthButton,
  RenownLoginButton,
  RenownLogo,
  RenownUserButton,
} from "../../src/components/index.js";
import { RenownUserProvider } from "../../src/providers/renown-user-provider.js";

const styles = {
  container: {
    maxWidth: "800px",
    margin: "0 auto",
    padding: "40px 20px",
  },
  header: {
    marginBottom: "40px",
    textAlign: "center" as const,
  },
  title: {
    fontSize: "24px",
    fontWeight: 600,
    marginBottom: "8px",
    color: "#111827",
  },
  subtitle: {
    fontSize: "14px",
    color: "#6b7280",
  },
  section: {
    marginBottom: "40px",
    padding: "24px",
    backgroundColor: "white",
    borderRadius: "12px",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  sectionTitle: {
    fontSize: "16px",
    fontWeight: 600,
    marginBottom: "16px",
    color: "#374151",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  componentRow: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "16px",
    backgroundColor: "#f9fafb",
    borderRadius: "8px",
    marginBottom: "12px",
  },
  label: {
    fontSize: "14px",
    color: "#4b5563",
    minWidth: "160px",
  },
  code: {
    fontFamily: "monospace",
    fontSize: "12px",
    backgroundColor: "#f3f4f6",
    padding: "2px 6px",
    borderRadius: "4px",
  },
  description: {
    fontSize: "13px",
    color: "#6b7280",
    marginTop: "8px",
    lineHeight: "1.5",
  },
};

function App() {
  const [mockUser] = useState({
    address: "0x1234567890abcdef1234567890abcdef12345678",
    username: "vitalik.eth",
    avatarUrl: undefined,
  });

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "16px",
          }}
        >
          <RenownLogo width={142} height={38} color="#374151" />
        </div>
        <h1 style={styles.title}>Renown SDK Components</h1>
        <p style={styles.subtitle}>
          Visual test page for Renown authentication components
        </p>
      </header>

      {/* RenownLoginButton Section */}
      <section style={styles.section} data-testid="login-button-section">
        <h2 style={styles.sectionTitle}>
          <span style={styles.code}>RenownLoginButton</span>
        </h2>
        <p style={styles.description}>
          A login button with Renown branding. By default, clicking triggers
          login directly. Use <code style={styles.code}>showPopover</code> to
          show a hover popover instead.
        </p>
        <div style={styles.componentRow}>
          <span style={styles.label}>Default (direct login):</span>
          <RenownLoginButton onLogin={() => console.log("Login clicked!")} />
        </div>
        <div style={styles.componentRow} data-testid="popover-login">
          <span style={styles.label}>With popover:</span>
          <RenownLoginButton
            onLogin={() => console.log("Login clicked!")}
            showPopover
          />
        </div>
        <div style={styles.componentRow}>
          <span style={styles.label}>Custom trigger (with popover):</span>
          <RenownLoginButton
            onLogin={() => console.log("Login clicked!")}
            showPopover
            renderTrigger={({ onMouseEnter, onMouseLeave }) => (
              <button
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
                style={{
                  padding: "8px 16px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  cursor: "pointer",
                }}
              >
                Sign In
              </button>
            )}
          />
        </div>
        <div
          style={{
            ...styles.componentRow,
            backgroundColor: "#111827",
            padding: "16px",
            borderRadius: "8px",
          }}
          data-testid="dark-mode-login"
        >
          <span style={{ ...styles.label, color: "#f9fafb" }}>
            Dark mode (with popover):
          </span>
          <RenownLoginButton
            onLogin={() => console.log("Login clicked!")}
            darkMode
            showPopover
          />
        </div>
      </section>

      {/* RenownUserButton Section */}
      <section style={styles.section} data-testid="user-button-section">
        <h2 style={styles.sectionTitle}>
          <span style={styles.code}>RenownUserButton</span>
        </h2>
        <p style={styles.description}>
          A user avatar button that shows account info in a popover with options
          to copy address, view profile, and disconnect. Click the avatar to see
          the popover.
        </p>
        <div style={styles.componentRow}>
          <span style={styles.label}>Without avatar:</span>
          <RenownUserButton
            address={mockUser.address}
            username={mockUser.username}
            userId="mock-document-id-1"
            onDisconnect={() => console.log("Disconnect clicked!")}
          />
        </div>
        <div style={styles.componentRow}>
          <span style={styles.label}>With avatar:</span>
          <RenownUserButton
            address={mockUser.address}
            username={mockUser.username}
            avatarUrl="https://unavatar.io/github/vitalik"
            userId="mock-document-id-2"
            onDisconnect={() => console.log("Disconnect clicked!")}
          />
        </div>
        <div style={styles.componentRow}>
          <span style={styles.label}>No username:</span>
          <RenownUserButton
            address={mockUser.address}
            userId="mock-document-id-3"
            onDisconnect={() => console.log("Disconnect clicked!")}
          />
        </div>
      </section>

      {/* RenownAuthButton Section */}
      <section style={styles.section} data-testid="auth-button-section">
        <h2 style={styles.sectionTitle}>
          <span style={styles.code}>RenownAuthButton</span>
        </h2>
        <p style={styles.description}>
          Smart authentication button that adapts based on auth state. Shows
          RenownLoginButton when not authenticated, and RenownUserButton when
          authenticated. This component requires the RenownUserProvider to be
          initialized.
        </p>
        <div style={styles.componentRow}>
          <span style={styles.label}>With RenownUserProvider:</span>
          <RenownUserProvider renownUrl="https://www.renown.id">
            <RenownAuthButton />
          </RenownUserProvider>
        </div>
      </section>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
