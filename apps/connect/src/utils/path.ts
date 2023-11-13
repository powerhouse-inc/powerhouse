export const sanitizePath = (path: string) =>
    path.replace(/\s/g, '-').toLowerCase();
