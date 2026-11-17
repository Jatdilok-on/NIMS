import path from 'path';
import type { NextConfig } from 'next';

const internalApiUrl = process.env.INTERNAL_API_URL || 'http://localhost:4000/api';

const nextConfig: NextConfig = {
  ...(process.env.NEXT_OUTPUT === 'standalone' ? { output: 'standalone' as const } : {}),
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    optimizePackageImports: ['lucide-react', 'recharts', '@xyflow/react'],
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${internalApiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
