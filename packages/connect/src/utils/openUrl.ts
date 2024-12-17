const openBrowserUrl = (url: string) => window.open(url, '_blank');

export const openUrl = window.electronAPI?.openURL ?? openBrowserUrl;
