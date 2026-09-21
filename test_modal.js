const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // Start next server or navigate if already running
  console.log("Navigating to http://localhost:3000/structure...");
  await page.goto('http://localhost:3000/structure', { waitUntil: 'networkidle' });

  // Take initial screenshot
  await page.screenshot({ path: '/home/jules/verification/screenshots/structure_page.png' });

  // Click on the first member card
  console.log("Clicking on first structure member card...");
  const firstCard = page.locator('.cursor-pointer').first();
  await firstCard.click();

  await page.waitForTimeout(500);

  // Take modal screenshot
  console.log("Capturing modal screenshot...");
  await page.screenshot({ path: '/home/jules/verification/screenshots/structure_modal.png' });

  // Close modal with Escape
  console.log("Pressing Escape to close modal...");
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Capture closed state screenshot
  await page.screenshot({ path: '/home/jules/verification/screenshots/structure_modal_closed.png' });

  await browser.close();
  console.log("Modal test completed successfully!");
})();
