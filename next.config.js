/** @type {import("next").NextConfig} */
const nextConfig = {
  devIndicators: false,
  allowedDevOrigins: ["*.rush.zhenguanyu.com", "*.rush-dev.zhenguanyu.com"],
  // 允许外部访问（用于 HMR Bridge）
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Access-Control-Allow-Origin",
            value: "*",
          },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET, POST, PUT, DELETE, OPTIONS",
          },
          {
            key: "Access-Control-Allow-Headers",
            value: "Content-Type, Authorization",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
