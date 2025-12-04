import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  RenownLoginButton,
  RenownUserButton,
  RenownAuthButton,
  RenownLogo,
} from "../../src/components/index.js";
import { UserProvider } from "../../src/providers/user-provider.js";

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
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "16px" }}>
          <RenownLogo width={142} height={38} color="#374151" />
        </div>
        <h1 style={styles.title}>Renown SDK Components</h1>
        <p style={styles.subtitle}>Visual test page for Renown authentication components</p>
      </header>

      {/* RenownLoginButton Section */}
      <section style={styles.section} data-testid="login-button-section">
        <h2 style={styles.sectionTitle}>
          <span style={styles.code}>RenownLoginButton</span>
        </h2>
        <p style={styles.description}>
          A button that opens a popover with the Renown login option.
          Click the button to see the popover with the "Connect" option.
        </p>
        <div style={styles.componentRow}>
          <span style={styles.label}>Default:</span>
          <RenownLoginButton onLogin={() => console.log("Login clicked!")} />
        </div>
        <div style={styles.componentRow}>
          <span style={styles.label}>With custom trigger:</span>
          <RenownLoginButton
            onLogin={() => console.log("Login clicked!")}
            renderTrigger={({ onClick }) => (
              <button onClick={onClick} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #ccc", cursor: "pointer" }}>
                Sign In
              </button>
            )}
          />
        </div>
      </section>

      {/* RenownUserButton Section */}
      <section style={styles.section} data-testid="user-button-section">
        <h2 style={styles.sectionTitle}>
          <span style={styles.code}>RenownUserButton</span>
        </h2>
        <p style={styles.description}>
          A user avatar button that shows account info in a popover with options to copy address,
          view profile, and disconnect. Click the avatar to see the popover.
        </p>
        <div style={styles.componentRow}>
          <span style={styles.label}>Without avatar:</span>
          <RenownUserButton
            address={mockUser.address}
            username={mockUser.username}
            profileUrl={`https://renown.id/profile/${mockUser.address}`}
            onDisconnect={() => console.log("Disconnect clicked!")}
          />
        </div>
        <div style={styles.componentRow}>
          <span style={styles.label}>With avatar:</span>
          <RenownUserButton
            address={mockUser.address}
            username={mockUser.username}
            avatarUrl="https://unavatar.io/github/vitalik"
            profileUrl={`https://renown.id/profile/${mockUser.address}`}
            onDisconnect={() => console.log("Disconnect clicked!")}
          />
        </div>
        <div style={styles.componentRow}>
          <span style={styles.label}>No username:</span>
          <RenownUserButton
            address={mockUser.address}
            profileUrl={`https://renown.id/profile/${mockUser.address}`}
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
          Smart authentication button that adapts based on auth state.
          Shows RenownLoginButton when not authenticated, and RenownUserButton when authenticated.
          This component requires the UserProvider to be initialized.
        </p>
        <div style={styles.componentRow}>
          <span style={styles.label}>With UserProvider:</span>
          <UserProvider renownUrl="https://www.renown.id">
            <RenownAuthButton />
          </UserProvider>
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
