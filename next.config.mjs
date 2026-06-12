/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Emit a self-contained server bundle (.next/standalone) for a minimal Docker image.
  output: 'standalone',
  // The generator and the AI coach read their prompts from prompts/ at runtime
  // via fs; make sure those files are traced into the standalone bundle.
  outputFileTracingIncludes: {
    '/**': ['./prompts/**'],
  },
};

export default nextConfig;
