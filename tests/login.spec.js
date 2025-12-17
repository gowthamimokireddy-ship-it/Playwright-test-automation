const { test, expect } = require('@playwright/test');
const data = require('../test-data.js');

test.describe('Demowebshop Login', () => {
  test('Login Page', async ({ page }) => {
    const email = process.env.TEST_EMAIL || data.user.email;
    const password = process.env.TEST_PASSWORD || data.user.password;

    await page.goto(data.baseUrl + '/login');

    await page.fill('#Email', email);
    await page.fill('#Password', password);
    await page.click('input[value="Log in"]');

    // await expect(page.locator('a[href="/logout"], text=Log out')).toBeVisible({ timeout: 10000 });

    // Search product
    await page.fill('input[type="search"]', data.product.searchQuery);
    await page.press('input[type="search"]', 'Enter');
    await page.waitForSelector('.product-list, .search-results');
  });
});
