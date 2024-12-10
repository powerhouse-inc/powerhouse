export default function GraphQLIframe({
  url,
  query,
}: {
  url: string;
  query?: string;
}) {
  return (
    <iframe
      src={`${url}${query ? "?query=" + encodeURIComponent(query) : ""}`}
      height="100%"
      width="100%"
      className="min-h-[calc(100vh-63px)]"
    />
  );
}
