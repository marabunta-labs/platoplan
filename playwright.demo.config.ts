import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config dedicated to recording the PlatoPlan demo video.
 *
 * - Mobile portrait viewport (great for sharing on Twitter/X).
 * - Video always recorded, sized to the viewport (no letterboxing).
 * - Headed Chromium, run serially, so the walkthrough looks natural.
 *
 * Usage (Metro web must be running at http://localhost:8081):
 *   npm run demo:video
 * The .webm video is written to e2e-artifacts/.
 */

const MOBILE = { width: 390, height: 844 };

export default defineConfig({
  testDir: './e2e',
  timeout: 360_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './e2e-artifacts',
  // Keep the recorded video whether the run passes or fails.
  preserveOutput: 'always',
  use: {
    baseURL: process.env.DEMO_URL || 'http://localhost:8081',
    viewport: MOBILE,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    // Record a video for every test, sized exactly to the mobile viewport.
    video: {
      mode: 'on',
      size: MOBILE,
    },
  },
  projects: [
    {
      name: 'mobile-demo',
      use: {
        ...devices['Desktop Chrome'],
        viewport: MOBILE,
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
});
