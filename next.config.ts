import type { NextConfig } from 'next';
import { parseBuildConfig } from './src/server/config';

// Configuration imports/builds must not validate runtime deployment credentials.
parseBuildConfig(process.env);
const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  logging: { incomingRequests: false },
};
export default config;
