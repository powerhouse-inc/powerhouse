// Serves build/ the way `docusaurus serve` does for baseUrl "/".
import http from "node:http";
import handler from "serve-handler";

const server = http.createServer((req, res) =>
  handler(req, res, {
    public: "build",
    cleanUrls: true,
    trailingSlash: false,
    directoryListing: false,
  }),
);

server.listen(Number(process.env.PORT ?? 3000), "0.0.0.0");
process.on("SIGTERM", () => server.close(() => process.exit(0)));
