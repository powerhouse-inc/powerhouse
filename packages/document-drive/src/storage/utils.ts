export const isValidDocumentId = (id: string) =>
  id && id.length > 0 && /^[a-zA-Z0-9_-]+$/.test(id);

export const isValidSlug = (slug: string) =>
  slug && slug.length > 0 && /^[a-zA-Z0-9_-]+$/.test(slug);
