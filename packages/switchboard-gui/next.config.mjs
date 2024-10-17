/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: process.env.BASE_PATH ?? "",
  assetPrefix: process.env.ASSET_PREFIX ?? "",
};

export default nextConfig;
