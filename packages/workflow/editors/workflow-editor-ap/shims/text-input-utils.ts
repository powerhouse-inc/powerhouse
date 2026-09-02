// Shim for the mentions text-input utils (interpolation UI is out of scope).
export const textMentionUtils = {
  isDataSelectorOrChildOfDataSelector(_element: HTMLElement): boolean {
    return false;
  },
};
