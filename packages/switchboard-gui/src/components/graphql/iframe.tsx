import { useSearchParams } from "next/navigation";

export default function GraphQLIframe({ url }: { url: string }) {
  const searchParams = useSearchParams();
  const query = searchParams?.get("query");
  return (
    <iframe
      src={`${url}${query ? "?query=" + encodeURIComponent(query) : ""}`}
      height="100%"
      width="100%"
      className="min-h-[calc(100vh-63px)]"
    />
  );
}
