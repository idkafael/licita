import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // Garantir que o worker do pdfjs-dist seja incluído no bundle do Vercel
  outputFileTracingIncludes: {
    '/api/processar': [
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    ],
    '/api/preview': [
      'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',
      'node_modules/pdfjs-dist/legacy/build/pdf.mjs',
    ],
  },
};

export default nextConfig;
