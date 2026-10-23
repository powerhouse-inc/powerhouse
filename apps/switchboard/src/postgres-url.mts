export function isPostgresUrl(url: string) {
  return url.startsWith("postgresql") || url.startsWith("postgres");
}
