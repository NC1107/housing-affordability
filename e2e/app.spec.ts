import { test, expect } from 'playwright/test'

test.describe('App loads and renders', () => {
  test('shows header and search bar', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('h1')).toHaveText('Home Search')
    await expect(page.locator('text=Find affordable homes by location or income')).toBeVisible()
  })

  test('shows map container', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.leaflet-container')).toBeVisible()
  })

  test('shows affordability section', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Affordability')).toBeVisible()
  })

  test('page loads without console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))
    await page.goto('/')
    await expect(page.locator('h1')).toBeVisible()
    // Allow warnings about missing API key, but no actual errors
    expect(errors.filter(e => !e.includes('API') && !e.includes('fetch'))).toHaveLength(0)
  })
})

test.describe('Income search flow', () => {
  test('income search button triggers nationwide search', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await expect(incomeButton).toBeVisible()
    await incomeButton.click()

    // Wait for housing data to load
    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    // Should show summary cards
    await expect(page.getByText('ZIP Codes', { exact: true })).toBeVisible()
    await expect(page.locator('text=Median Home Value')).toBeVisible()
  })

  test('shows state affordability data after income search', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()

    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    // Should show summary stats
    await expect(page.locator('text=Median Rent')).toBeVisible()
    await expect(page.locator('text=Affordable ZIPs')).toBeVisible()
  })
})

test.describe('Affordability form', () => {
  test('can change annual income', async ({ page }) => {
    await page.goto('/')

    // The affordability section is expanded by default
    // Find the income input by its label
    const incomeLabel = page.locator('text=Annual Income')
    await expect(incomeLabel).toBeVisible()

    // The income input is type="text" with inputMode="numeric"
    const incomeInput = page.locator('input[inputmode="numeric"]').first()
    await expect(incomeInput).toBeVisible()

    // Clear and type new income
    await incomeInput.fill('75000')
    await incomeInput.blur()
    await expect(incomeInput).toHaveValue('75,000')
  })

  test('shows monthly gross income', async ({ page }) => {
    await page.goto('/')

    // With default income of $47,000, monthly gross should be shown
    await expect(page.locator('text=Monthly gross:')).toBeVisible()
  })

  test('advanced settings toggle works', async ({ page }) => {
    await page.goto('/')

    // Find and click the "Show Advanced Settings" button
    const advancedButton = page.locator('button', { hasText: /Advanced Settings/i })
    await expect(advancedButton).toBeVisible()
    await advancedButton.click()

    // Should now show advanced fields like Property Tax
    await expect(page.locator('text=Property Tax Rate')).toBeVisible()

    // Click again to hide
    await advancedButton.click()
    await expect(page.locator('text=Property Tax Rate')).not.toBeVisible()
  })
})

test.describe('Housing data table', () => {
  test('table and expand button appear after income search', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()

    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    // Check for ZIP count in summary cards
    await expect(page.getByText('ZIP Codes', { exact: true })).toBeVisible()

    // Look for expand view button
    const expandButton = page.locator('text=Expand View')
    await expect(expandButton).toBeVisible()
  })

  test('table modal opens on expand click', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()
    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    // Click expand view
    const expandButton = page.locator('text=Expand View')
    await expandButton.click()

    // Modal should open - check for the modal backdrop or content
    await expect(page.locator('.fixed.inset-0').first()).toBeVisible()
  })
})

test.describe('Mobile hamburger menu', () => {
  test('hamburger button shows and toggles sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Hamburger should be visible on mobile
    const hamburger = page.locator('button[aria-label="Open menu"]')
    await expect(hamburger).toBeVisible()

    // Click to open sidebar
    await hamburger.click()

    // Close menu button should appear
    await expect(page.locator('button[aria-label="Close menu"]')).toBeVisible()

    // Backdrop should appear
    const backdrop = page.locator('[aria-hidden="true"].fixed')
    await expect(backdrop).toBeVisible()

    // Sidebar content should be accessible
    await expect(page.locator('h1')).toBeVisible()

    // Close by clicking backdrop
    await backdrop.click()

    // Open menu button should reappear
    await expect(page.locator('button[aria-label="Open menu"]')).toBeVisible()
  })

  test('sidebar closes after income search on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/')

    // Open sidebar
    await page.locator('button[aria-label="Open menu"]').click()
    await expect(page.locator('button[aria-label="Close menu"]')).toBeVisible()

    // Trigger income search
    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()

    // Sidebar should close (hamburger should show "Open menu" again)
    await expect(page.locator('button[aria-label="Open menu"]')).toBeVisible({ timeout: 15000 })
  })
})

test.describe('Commute settings', () => {
  test('commute settings visible in address mode', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Commute Settings')).toBeVisible()
  })

  test('can toggle between drive and transit', async ({ page }) => {
    await page.goto('/')

    // Expand commute settings if needed
    const commuteHeader = page.locator('button', { hasText: 'Commute Settings' })
    await commuteHeader.click()

    // Look for drive/transit buttons
    const driveButton = page.locator('button', { hasText: /drive/i })
    const transitButton = page.locator('button', { hasText: /transit/i })

    if (await driveButton.isVisible()) {
      await transitButton.click()
    }
  })
})

test.describe('Clear functionality', () => {
  test('clear button resets state after income search', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()
    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    // Click clear/reset
    const clearButton = page.locator('button', { hasText: /clear|reset|×/i })
    if (await clearButton.first().isVisible()) {
      await clearButton.first().click()
      // National Housing Data section should disappear
      await expect(page.locator('text=National Housing Data')).not.toBeVisible({ timeout: 5000 })
    }
  })
})

test.describe('Data display cards', () => {
  test('shows all summary cards after income search', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()
    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    // Check individual cards
    await expect(page.locator('text=Median Home Value')).toBeVisible()
    await expect(page.locator('text=Median Rent')).toBeVisible()
    await expect(page.getByText('ZIP Codes', { exact: true })).toBeVisible()
    await expect(page.locator('text=Data Coverage')).toBeVisible()
  })

  test('shows affordable ZIPs count with income', async ({ page }) => {
    await page.goto('/')

    const incomeButton = page.locator('button', { hasText: /search by income/i })
    await incomeButton.click()
    await expect(page.locator('text=National Housing Data')).toBeVisible({ timeout: 15000 })

    await expect(page.locator('text=Affordable ZIPs')).toBeVisible()
    await expect(page.getByText('Max Home Price', { exact: true })).toBeVisible()
  })
})

test.describe('Show/hide unaffordable toggle', () => {
  test('unaffordable toggle not visible before search', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=Show unaffordable ZIPs')).not.toBeVisible()
  })
})
