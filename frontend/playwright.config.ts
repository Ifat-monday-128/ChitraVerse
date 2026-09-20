import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  workers: 1,
  timeout: 45000,
  use: { baseURL: 'http://localhost:3001', channel: 'chromium', timezoneId: 'Asia/Dhaka', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/vinext/dist/cli.js dev --config vite.config.ts --port 3001',
    url: 'http://localhost:3001',
    timeout: 120000,
    env: { NEXT_PUBLIC_API_URL: 'http://localhost:5001', WRANGLER_SEND_METRICS: 'false' },
  },
});
