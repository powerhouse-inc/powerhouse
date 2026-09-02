// ph-stub: upstream exports flow screenshot helpers (html-to-image + jszip);
// not supported in the vendored builder.
export const flowScreenshotUtils = {
  SCREENSHOT_EXCLUDE_ATTRIBUTE: "data-screenshot-exclude",
  downloadFlowScreenshot: async (_flowName: string): Promise<void> => {
    console.warn('Flow screenshots are not supported in this editor');
  },
  downloadFlowAsImage: async (_args: {
    nodes: unknown[];
    flowName: string;
  }): Promise<void> => {
    console.warn('Flow screenshots are not supported in this editor');
  },
};
