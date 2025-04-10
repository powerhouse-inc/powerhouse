# Connect App Test IDs

This document lists all components with their test IDs for end-to-end testing with Playwright.

## Navigation Components

### Sidebar (apps/connect/src/components/sidebar.tsx)
- Main Sidebar: `data-testid="main-sidebar"`
- Connect Logo: `data-testid="connect-logo"`
- Debug Settings Button: `data-testid="debug-settings-button"`
- Drive Items: `data-testid="drive-item-${index}"` (dynamic based on index)
- Add Drive Button: `data-testid="add-drive-button"`
- Drives Error Message: `data-testid="drives-error"`

### Drive View (apps/connect/src/components/drive-view.tsx)
- Drive View Container: `data-testid="drive-view"`
- Breadcrumbs: `data-testid="breadcrumbs"`
- Search Bar: `data-testid="search-bar"`
- Folder View: `data-testid="folder-view"`
- New Document Heading: `data-testid="new-document-heading"`
- Document Model List: `data-testid="document-model-list"`
- Document Model Buttons: `data-testid="document-model-${index}"` (dynamic based on index)

### Search (apps/connect/src/components/search-bar.tsx)
- Search Bar Input: `data-testid="search-bar-input"`

### Footer (apps/connect/src/components/footer.tsx)
- Footer: `data-testid="footer"`
- Cookie Policy Link: `data-testid="cookie-policy-link"`
- Disclaimer Link: `data-testid="disclaimer-link"`
- Powerhouse Link: `data-testid="powerhouse-link"`

### Cookie Banner (apps/connect/src/components/cookie-banner.tsx)
- Cookie Banner Container: `data-testid="cookie-banner"`
- Accept Cookies Button: `data-testid="accept-cookies-button"`
- Reject Cookies Button: `data-testid="reject-cookies-button"`
- Cookie Policy Modal Link: `data-testid="cookie-policy-modal-link"`

## Editor Components

### Document Editor (apps/connect/src/components/document-editor-container.tsx)
- Document Editor Container: `data-testid="document-editor-container"`
- Document Editor: `data-testid="document-editor"`

## Modals

### Settings Modal (apps/connect/src/components/modal/modals/SettingsModal.tsx)
- Settings Modal: `data-testid="settings-modal"`
- Appearance Tab: `data-testid="appearance-tab"`
- Dark Mode Toggle: `data-testid="dark-mode-toggle"`

## Best Practices

1. Always use the data-testid attribute for test selection instead of CSS classes or text content
2. When selecting components with dynamic IDs, use patterns like `drive-item-*` with appropriate index values
3. Keep this document updated when adding new components or modifying existing ones
4. Write tests that simulate real user interactions 