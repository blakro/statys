/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxifie l'API Python : en dev vers uvicorn (port 8000), en production
  // vers la fonction serverless Python déployée par Vercel (api/index.py).
  rewrites: async () => [
    {
      source: "/api/py/:path*",
      destination:
        process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:8000/api/py/:path*"
          : "/api/",
    },
  ],
};

export default nextConfig;
