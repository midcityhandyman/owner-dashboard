/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Type checking runs in the build. Linting is left to the editor.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
