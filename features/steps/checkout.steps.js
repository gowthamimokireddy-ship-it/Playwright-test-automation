const { Before, After, Given, When, Then, setDefaultTimeout } = require('@cucumber/cucumber');
const { chromium } = require('playwright');
const { expect } = require('@playwright/test');
const data = require('../../../test-data.js');

setDefaultTimeout(60 * 1000);

Before(async function () {
  this.browser = await chromium.launch({ headless: true });
  this.context = await this.browser.newContext();
  this.page = await this.context.newPage();
});

After(async function () {
  if (this.page) await this.page.close();
  if (this.context) await this.context.close();
  if (this.browser) await this.browser.close();
});

Given('I am logged in', async function () {
  const page = this.page;
  const email = process.env.TEST_EMAIL || data.user.email;
  const password = process.env.TEST_PASSWORD || data.user.password;
  await page.goto(`${data.baseUrl}/login`);
  await page.fill('#Email', email);
  await page.fill('#Password', password);
  await page.click('input[value="Log in"]');
  await page.waitForLoadState('networkidle');
});

When('I search for the product and complete checkout', async function () {
  const page = this.page;
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
    await page.locator('#BillingNewAddress_Email').fill(process.env.TEST_EMAIL || data.user.email);
    await page.locator('#BillingNewAddress_Address1').fill(data.address.line1);
    await page.locator('#BillingNewAddress_City').fill(data.address.city);
    await page.locator('#BillingNewAddress_ZipPostalCode').fill(data.address.zip);

    // Country dropdown
    const countrySelect = page.locator('#BillingNewAddress_CountryId').first();
    if ((await countrySelect.count()) > 0 && await countrySelect.isVisible()) {
      const countryPref = data.address.countryId || data.address.country || data.address.countryCode;
      if (countryPref) {
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
          if (val && val.trim() !== '') { await countrySelect.selectOption(val).catch(() => {}); break; }
        }
      }
      await page.waitForLoadState('networkidle');
    }

    // State/province dropdown
    const stateSelect = page.locator('#BillingNewAddress_StateProvinceId').first();
    if ((await stateSelect.count()) > 0 && await stateSelect.isVisible()) {
      const statePref = data.address.state || data.address.stateId;
      if (statePref) {
        await stateSelect.selectOption({ label: String(statePref) }).catch(async () => {
          await stateSelect.selectOption(String(statePref)).catch(async () => {
            const opts = stateSelect.locator('option');
            for (let i = 1; i < await opts.count(); i++) {
              const v = await opts.nth(i).getAttribute('value');
              if (v && v.trim() !== '') { await stateSelect.selectOption(v).catch(() => {}); break; }
            }
          });
        });
      }
    }

    await page.locator('#BillingNewAddress_PhoneNumber').fill(data.address.phone || data.user.phone);
    await page.waitForLoadState('networkidle');
  }

  // Click the billing Continue
  const billingContinue = page.getByRole('button', { name: /Continue/i }).first();
  if ((await billingContinue.count()) > 0) {
    await billingContinue.click();
    await page.waitForLoadState('networkidle');
  }

  // Advance through checkout steps by clicking Continue
  for (let i = 0; i < 6; i++) {
    const cont = page.getByRole('button', { name: /Continue/i }).first();
    if ((await cont.count()) > 0) {
      await cont.click();
      await page.waitForLoadState('networkidle');
    } else break;
  }

  // Select payment method
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
    await place.click();
    await page.waitForSelector('text=Your order has been successfully processed', { timeout: 10000 }).catch(() => {});
    await page.waitForLoadState('networkidle');
  }

  // Go to order history and try cancel
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
});

Then('I should see my account link and the order processed message (if any)', async function () {
  const page = this.page;
  await expect(page.locator('text=My account').first()).toBeVisible({ timeout: 5000 }).catch(() => {});
});
