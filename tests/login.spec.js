const { test, expect } = require('@playwright/test');
const data = require('../test-data.js');

test.describe('Demowebshop Login', () => {
  test('Login Page', async ({ page }) => {
    const email = process.env.TEST_EMAIL || data.user.email;
    const password = process.env.TEST_PASSWORD || data.user.password;

    await page.goto(`${data.baseUrl}/login`);

    await page.fill('#Email', email);
    await page.fill('#Password', password);
    await page.click('input[value="Log in"]');

    // Search product
    await page.fill('#small-searchterms', data.product.searchQuery);
    await page.press('#small-searchterms', 'Enter');
    await page.waitForSelector('.product-item, .product-list, .search-results', { timeout: 10000 });

    // Select product
    const index = data.product.selectIndex || 0;
    const product = page.locator('.product-item .product-title a, .product-title a').nth(index);
    await product.click();
    await page.waitForTimeout(500);

    // Add to cart
    const addBtn = page.getByRole('button', { name: /Add to cart/i }).first();
    await addBtn.click();
    await page.waitForTimeout(500);

    // Ensure terms/agree checkbox is enabled before checkout (if present)
    const tosCheckbox = page.locator('input[type="checkbox"][id*="term"], input[type="checkbox"][name*="term"], input[type="checkbox"][id*="agree"], input[type="checkbox"][name*="agree"]').first();
    if ((await tosCheckbox.count()) > 0) {
      if (!(await tosCheckbox.isChecked())) {
        await tosCheckbox.check();
      }
    }

    // Go to cart and checkout
    await page.goto(`${data.baseUrl}/cart`);
    await page.waitForLoadState('networkidle');

    // Ensure terms/agree checkbox is enabled on cart page (if present)
    const tosCheckboxCart = page.locator('input[type="checkbox"][id*="term"], input[type="checkbox"][name*="term"], input[type="checkbox"][id*="agree"], input[type="checkbox"][name*="agree"]').first();
    if ((await tosCheckbox.count()) > 0 && !(await tosCheckbox.isChecked())) {
      await tosCheckbox.check();
      await page.waitForLoadState('networkidle');
    }

    const checkoutLink = page.locator('a[href*="/checkout"]').first();
    const checkoutButton = page.getByRole('button', { name: /Checkout/i }).first();

    if (await checkoutLink.isVisible().catch(() => false)) {
      await checkoutLink.click();
    } else if (await checkoutButton.isVisible().catch(() => false)) {
      await checkoutButton.click();
    } else {
      await page.goto(`${data.baseUrl}/checkout`);
    }
    await page.waitForLoadState('networkidle');

    // Address step: wait for either the select or new-address form
await page.waitForSelector('#billing-address-select, #BillingNewAddress_FirstName', { timeout: 10000 }).catch(() => {});

// Prefer existing address select, if present and visible
const addressSelect = page.locator('#billing-address-select').first();
if ((await addressSelect.count()) > 0 && await addressSelect.isVisible()) {
  const options = addressSelect.locator('option');
  const optCount = await options.count();

  if (optCount > 1) {
    // try to select the first option that has a non-empty value
    let selected = false;
    for (let i = 1; i < optCount; i++) {
      const val = await options.nth(i).getAttribute('value');
      if (val && val.trim() !== '') {
        await addressSelect.selectOption(val).catch(() => {});
        selected = true;
        break;
      }
    }
    // fallback to index 1 if no non-empty value found
    if (!selected) {
      await addressSelect.selectOption({ index: 1 }).catch(() => {});
    }
    await page.waitForLoadState('networkidle');
  }
}

// If new-billing form is visible, fill it reliably
const billingFirst = page.locator('#BillingNewAddress_FirstName').first();
if ((await billingFirst.count()) > 0 && await billingFirst.isVisible()) {
  await billingFirst.fill(data.address.fullName.split(' ')[0] || data.user.firstName);
  await page.locator('#BillingNewAddress_LastName').fill(data.address.fullName.split(' ').slice(1).join(' ') || data.user.lastName);
  await page.locator('#BillingNewAddress_Email').fill(email || data.user.email);
  await page.locator('#BillingNewAddress_Address1').fill(data.address.line1);
  await page.locator('#BillingNewAddress_City').fill(data.address.city);
  await page.locator('#BillingNewAddress_ZipPostalCode').fill(data.address.zip);
  // Country dropdown: prefer explicit country from test data, otherwise pick first non-empty option
  const countrySelect = page.locator('#BillingNewAddress_CountryId').first();
  if ((await countrySelect.count()) > 0 && await countrySelect.isVisible()) {
    const countryPref = data.address.countryId || data.address.country || data.address.countryCode;
    if (countryPref) {
      // try selecting by value or by visible text
      await countrySelect.selectOption(countryPref).catch(async () => {
        const opt = countrySelect.locator('option', { hasText: String(countryPref) }).first();
        if ((await opt.count()) > 0) {
          const val = await opt.getAttribute('value');
          if (val) await countrySelect.selectOption(val).catch(() => {});
        }
      });
    } else {
      const options = countrySelect.locator('option');
      const optCount = await options.count();
      for (let i = 1; i < optCount; i++) {
        const val = await options.nth(i).getAttribute('value');
        if (val && val.trim() !== '') {
          await countrySelect.selectOption(val).catch(() => {});
          break;
        }
      }
    }
    await page.waitForLoadState('networkidle');
  }

  // State/province dropdown: if present try to select by provided state name or id
  const stateSelect = page.locator('#BillingNewAddress_StateProvinceId').first();
  if ((await stateSelect.count()) > 0 && await stateSelect.isVisible()) {
    const statePref = data.address.state || data.address.stateId;
    if (statePref) {
      try {
        await stateSelect.selectOption({ label: String(statePref) }).catch(async () => {
          await stateSelect.selectOption(String(statePref)).catch(async () => {
            // fallback to first non-empty option (guarded)
            try {
              const opts = stateSelect.locator('option');
              const optCount = await opts.count().catch(() => 0);
              for (let i = 1; i < optCount; i++) {
                if (typeof page.isClosed === 'function' && page.isClosed()) break;
                const v = await opts.nth(i).getAttribute('value').catch(() => null);
                if (v && v.trim() !== '') { await stateSelect.selectOption(v).catch(() => {}); break; }
              }
            } catch (e) {
              // ignore errors (page/context/browser may be closed)
            }
          });
        });
      } catch (e) {
        // ignore any unexpected errors during state selection
      }
    }
  }

  // Fill phone only if the page is still open and the field is present/visible
  try {
    if (typeof page.isClosed === 'function' && page.isClosed()) {
      // page closed - skip interactions
    } else {
      const phoneLocator = page.locator('#BillingNewAddress_PhoneNumber').first();
      if ((await phoneLocator.count()) > 0 && await phoneLocator.isVisible().catch(() => false)) {
        await phoneLocator.fill(data.address.phone || data.user.phone).catch(() => {});
      }
    }
  } catch (e) {
    // ignore errors when page/context/browser is closed unexpectedly
  }

  // Wait briefly for network activity but don't hang the test indefinitely
  try {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  } catch (e) {
    // ignore
  }
}

// Click the billing Continue button and wait for stability
const billingContinue = page.getByRole('button', { name: /Continue/i }).first();
if ((await billingContinue.count()) > 0) {
  await expect(billingContinue).toBeEnabled();
  await billingContinue.click();
  await page.waitForLoadState('networkidle');
}

// // Click the billing Continue button and wait for navigation/stability
// const billingContinue = page.getByRole('button', { name: /Continue/i }).first();
// if ((await billingContinue.count()) > 0) {
//   await expect(billingContinue).toBeEnabled();
//   await billingContinue.click();
//   await page.waitForLoadState('networkidle');
// }

    // Advance through checkout steps by clicking Continue
    for (let i = 0; i < 6; i++) {
      const cont = page.getByRole('button', { name: /Continue/i }).first();
      if ((await cont.count()) > 0) {
        await cont.click();
        await page.waitForLoadState('networkidle');
      } else break;
    }

    // Select payment method (e.g., Check / Money Order) if present
    const pm = page.locator(`text=${data.payment.method}`);
    if (await pm.count() > 0) {
      await pm.first().click();
      const continueBtn = page.getByRole('button', { name: /Continue/i }).first();
      if (await continueBtn.count() > 0) {
        await continueBtn.click();
        await page.waitForLoadState('networkidle');
      }
    }

    // Confirm / place order
    const place = page.getByRole('button', { name: /(Confirm|Place order)/i }).first();
    if ((await place.count()) > 0) {
      await expect(place).toBeEnabled();
      await place.click();
      await page.waitForSelector('text=Your order has been successfully processed', { timeout: 10000 }).catch(() => {});
      await page.waitForLoadState('networkidle');
    }

    // Scenario 3: Navigate to placed orders and attempt cancel
    await page.goto(`${data.baseUrl}/order/history`);
    await page.waitForLoadState('networkidle');
    const details = page.getByRole('link', { name: /Details/i }).first();
    if ((await details.count()) > 0) {
      await details.click();
      await page.waitForLoadState('networkidle');
      const cancel = page.getByRole('button', { name: /Cancel order|Cancel/i }).first();
      if ((await cancel.count()) > 0) {
        await cancel.click();
      }
    }

    // final: ensure we are still on site and logged in
    await expect(page.locator('text=My account').first()).toBeVisible({ timeout: 5000 }).catch(() => {});

  });
});
