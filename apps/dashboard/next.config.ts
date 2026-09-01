import type { NextConfig } from 'next'

const config: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@copilotkit/react-core', '@copilotkit/react-ui'],
}

export default config
