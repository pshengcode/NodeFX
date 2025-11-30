import { test, expect } from '@playwright/test';

test.describe('Toolbar Actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.waitForSelector('.react-flow__renderer');
    
    // Hide overlays that might interfere, but KEEP the toolbar visible since we are testing it!
    await page.addStyleTag({ content: `
      .absolute.bottom-6.right-6 { display: none !important; } /* Shader Preview */
      .absolute.top-20.left-4 { display: none !important; } /* Breadcrumbs */
    `});
  });

  test('can reset the canvas', async ({ page }) => {
    // 1. Add a node first so we have something to reset
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 300, y: 300 } });
    await page.locator('.fixed.z-50 input').fill('Float');
    await page.locator('.fixed.z-50 button', { hasText: 'Float' }).first().click();
    
    // Verify node exists
    await expect(page.locator('.react-flow__node', { hasText: 'Float' })).toBeVisible();

    // 2. Setup dialog handler to accept the confirmation
    page.on('dialog', dialog => dialog.accept());

    // 3. Click Reset button
    // The button has text "Reset" and title "Reset"
    await page.locator('button[title="Reset"]').click();

    // 4. Verify node is gone
    await expect(page.locator('.react-flow__node', { hasText: 'Float' })).not.toBeVisible();
  });

  test('can undo and redo actions', async ({ page }) => {
    // 1. Add a node
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 300, y: 300 } });
    await page.locator('.fixed.z-50 input').fill('Float');
    await page.locator('.fixed.z-50 button', { hasText: 'Float' }).first().click();
    
    // Verify node exists
    const floatNode = page.locator('.react-flow__node', { hasText: 'Float' });
    await expect(floatNode).toBeVisible();

    // 2. Click Undo
    // The button has title "Undo (Ctrl+Z)"
    await page.locator('button[title="Undo (Ctrl+Z)"]').click();

    // 3. Verify node is gone
    await expect(floatNode).not.toBeVisible();

    // 4. Click Redo
    // The button has title "Redo (Ctrl+Y)"
    await page.locator('button[title="Redo (Ctrl+Y)"]').click();

    // 5. Verify node is back
    await expect(floatNode).toBeVisible();
  });
});
