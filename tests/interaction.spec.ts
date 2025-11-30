import { test, expect } from '@playwright/test';

test.describe('Interaction Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Clear local storage to ensure a clean slate for each test
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    // Wait for React Flow to be ready
    await page.waitForSelector('.react-flow__renderer');

    // Hide UI overlays to prevent interception during tests
    await page.addStyleTag({ content: `
      .absolute.bottom-6.right-6 { display: none !important; } /* Shader Preview */
      .absolute.top-20.left-4 { display: none !important; } /* Breadcrumbs */
      /* We might need the toolbar for some tests, but for interaction on canvas it's better to hide it if it gets in the way. 
         However, the toolbar is at the top, and we are working at y=200, so it should be fine. 
         But let's hide it just in case. */
      .absolute.top-0.left-0.right-0.h-14 { display: none !important; } /* Toolbar */
    `});
  });

  test('can add a node via context menu', async ({ page }) => {
    // 1. Right click on the canvas background to open context menu
    // Target the pane specifically to avoid hitting other elements
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 300, y: 300 } });

    // 2. Wait for context menu to appear
    const contextMenu = page.locator('.fixed.z-50');
    await expect(contextMenu).toBeVisible();

    // 3. Search for "Float"
    const searchInput = contextMenu.locator('input');
    await searchInput.fill('Float');

    // 4. Click the "Float" option
    await contextMenu.locator('button', { hasText: 'Float' }).first().click();

    // 5. Verify the node is added
    const floatNode = page.locator('.react-flow__node', { hasText: 'Float' });
    await expect(floatNode).toBeVisible();
  });

  test('can connect two nodes', async ({ page }) => {
    // 1. Add a "Float" node (Source)
    // Place at top-left
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 100, y: 100 } });
    await page.locator('.fixed.z-50 input').fill('Float');
    await page.locator('.fixed.z-50 button', { hasText: 'Float' }).first().click();
    
    // 2. Add a "Add" node (Target)
    // Place at bottom-right (diagonal separation) to ensure no overlap
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 600, y: 400 } });
    await page.locator('.fixed.z-50 input').fill('Add');
    await page.locator('.fixed.z-50 button', { hasText: 'Add' }).first().click();

    // 3. Locate the nodes
    const sourceNode = page.locator('.react-flow__node', { hasText: 'Float' }).last();
    const targetNode = page.locator('.react-flow__node', { hasText: 'Add' }).last();

    // 4. Find handles
    // Source: Float output (Right)
    const sourceHandle = sourceNode.locator('.react-flow__handle-right');
    
    // Target: Add input (Left). It has two inputs usually. Pick the first one.
    const targetHandle = targetNode.locator('.react-flow__handle-left').first();

    // 5. Drag and Drop
    // We need to be precise. Hover over the center of the handle.
    await sourceHandle.hover();
    await page.mouse.down();
    
    // Move to target
    await targetHandle.hover();
    await page.mouse.up();

    // 6. Verify connection
    // An edge should appear.
    const edge = page.locator('.react-flow__edge');
    // We expect at least one edge now.
    await expect(edge.last()).toBeVisible();
  });

  test('can edit a uniform value', async ({ page }) => {
    // 1. Add a "Float" node
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 300, y: 300 } });
    await page.locator('.fixed.z-50 input').fill('Float');
    await page.locator('.fixed.z-50 button', { hasText: 'Float' }).first().click();

    const node = page.locator('.react-flow__node', { hasText: 'Float' }).last();
    
    // 2. Find the input
    // CustomNode uses SliderWidget which uses SmartNumberInput which uses input[type="number"]
    const input = node.locator('input[type="number"]');
    
    // 3. Change value
    await expect(input).toBeVisible();
    await input.fill('0.5'); 

    // 4. Verify value
    await expect(input).toHaveValue('0.5');
  });

  test('can drag and drop a node from sidebar', async ({ page }) => {
    // 1. Locate "Float Input" in the sidebar
    // The span has pointer-events-none, so we must target the parent div which is draggable.
    const sidebarItem = page.locator('.w-64 div[draggable="true"]', { hasText: 'Float Input' }).first();
    
    await expect(sidebarItem).toBeVisible();

    // 2. Drag to canvas
    // Use Playwright's dragTo which supports HTML5 DnD
    const canvasPane = page.locator('.react-flow__pane');
    
    // We drag to a specific position on the canvas
    await sidebarItem.dragTo(canvasPane, { targetPosition: { x: 400, y: 300 } });

    // 3. Verify node is added
    // Wait a bit for the drop to process
    await page.waitForTimeout(500);
    const floatNode = page.locator('.react-flow__node', { hasText: 'Float Input' });
    await expect(floatNode).toBeVisible();
  });

  test('can delete a node', async ({ page }) => {
    // 1. Add a node
    await page.locator('.react-flow__pane').click({ button: 'right', position: { x: 300, y: 300 } });
    await page.locator('.fixed.z-50 input').fill('Float');
    await page.locator('.fixed.z-50 button', { hasText: 'Float' }).first().click();
    
    const node = page.locator('.react-flow__node', { hasText: 'Float' }).last();
    await expect(node).toBeVisible();

    // 2. Select the node
    await node.click();
    
    // 3. Press Delete
    await page.keyboard.press('Delete');

    // 4. Verify node is gone
    await expect(node).not.toBeVisible();
  });
});
