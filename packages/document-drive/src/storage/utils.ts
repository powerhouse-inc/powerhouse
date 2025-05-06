export const isValidDocumentId = (id: string) => /^[a-zA-Z0-9_-]+$/.test(id);

export const isValidSlug = (slug: string) => /^[a-zA-Z0-9_-]+$/.test(slug);
