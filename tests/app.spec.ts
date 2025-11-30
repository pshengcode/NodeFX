import { test, expect } from '@playwright/test';

test.describe('GLSL Editor App', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('has title', async ({ page }) => {
    // Adjust this expectation based on your actual document title in index.html
    await expect(page).toHaveTitle(/NodeFX/); 
  });

  test('loads the editor canvas', async ({ page }) => {
    // Check for the React Flow container
    const canvas = page.locator('.react-flow');
    await expect(canvas).toBeVisible();
  });

  test('renders initial nodes', async ({ page }) => {
    // Check if we have some nodes rendered
    const nodes = page.locator('.react-flow__node');
    // Expect at least one node (e.g. Output node)
    await expect(nodes.first()).toBeVisible();
    expect(await nodes.count()).toBeGreaterThan(0);
  });

  test('visual regression check', async ({ page }) => {
    // Wait for the app to settle
    await page.waitForTimeout(1000); 
    
    // Take a screenshot
    // Note: On first run, this won't have a baseline to compare against, 
    // but it verifies the screenshot capability works.
    // In a real setup, you'd commit the baseline.
    await expect(page).toHaveScreenshot('initial-state.png', { maxDiffPixels: 100 });
  });
});
