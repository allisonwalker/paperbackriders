import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["node_modules/**", ".next/**", "prototype/**", ".cursor/**", "drizzle/**"],
  },
];

export default config;
