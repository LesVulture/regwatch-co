import type { NextConfig } from "next";

const config: NextConfig = {
  // El repo es público: no se filtra el stack en las cabeceras.
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
