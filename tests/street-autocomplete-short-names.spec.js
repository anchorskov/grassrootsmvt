import { test, expect } from '@playwright/test';

test.describe('Street Autocomplete - Short Street Names', () => {
  test('should show suggestions for single character input "1" including "1ST ST"', async ({ page }) => {
    // Mock the /api/streets POST endpoint with sample data
    await page.route('**/api/streets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          streets: [
            '1ST ST',
            '2ND ST',
            '3RD ST',
            'A AVE',
            'B ST',
            'BWJ RD',
            'FOX ST',
            'ADAMS ST',
            'BRADLEY AVE',
            'CANBY ST'
          ]
        })
      });
    });

    // Navigate to the test page
    await page.goto('/test_street_autocomplete_short_names.html');

    // Wait for the page to initialize
    await page.waitForLoadState('networkidle');
    
    // Wait for the autocomplete to be ready
    await page.waitForFunction(() => {
      return window.StreetAutocompleteOptimized !== undefined;
    }, { timeout: 5000 });

    // Click the "Load Streets" button
    const loadButton = page.locator('#btnLoadStreets');
    await loadButton.click();

    // Wait for streets to load (check the log or button state)
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnTest1Char');
      return btn && !btn.disabled;
    }, { timeout: 5000 });

    // Get the street input field
    const streetInput = page.locator('#street');
    
    // Type "1" into the street field
    await streetInput.fill('1');
    await streetInput.dispatchEvent('input');

    // Wait a moment for the suggestions to appear
    await page.waitForTimeout(200);

    // Get the suggestions dropdown
    const suggestionsDropdown = page.locator('#streetSuggestions');

    // Assert that the dropdown is visible
    await expect(suggestionsDropdown).toBeVisible();

    // Assert that "1ST ST" appears in the suggestions
    const suggestions = page.locator('.autocomplete-suggestion[data-street]');
    await expect(suggestions).not.toHaveCount(0);

    // Check if "1ST ST" is in the suggestions
    const suggestionTexts = await suggestions.allTextContents();
    expect(suggestionTexts.some(text => text.includes('1ST ST'))).toBeTruthy();
  });

  test('should show suggestions for "A" including "A AVE"', async ({ page }) => {
    // Mock the /api/streets POST endpoint
    await page.route('**/api/streets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          streets: [
            '1ST ST',
            '2ND ST',
            'A AVE',
            'A RD',
            'B ST',
            'ADAMS ST'
          ]
        })
      });
    });

    await page.goto('/test_street_autocomplete_short_names.html');
    await page.waitForLoadState('networkidle');
    
    await page.waitForFunction(() => {
      return window.StreetAutocompleteOptimized !== undefined;
    }, { timeout: 5000 });

    // Load streets
    await page.click('#btnLoadStreets');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnTest1Char');
      return btn && !btn.disabled;
    }, { timeout: 5000 });

    // Type "A"
    const streetInput = page.locator('#street');
    await streetInput.fill('A');
    await streetInput.dispatchEvent('input');
    await page.waitForTimeout(200);

    // Verify dropdown is visible
    const suggestionsDropdown = page.locator('#streetSuggestions');
    await expect(suggestionsDropdown).toBeVisible();

    // Verify "A AVE" is in suggestions
    const suggestions = page.locator('.autocomplete-suggestion[data-street]');
    const suggestionTexts = await suggestions.allTextContents();
    expect(suggestionTexts.some(text => text.includes('A AVE'))).toBeTruthy();
  });

  test('should enable house field after typing 3 characters', async ({ page }) => {
    // Mock the /api/streets endpoint
    await page.route('**/api/streets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          streets: [
            '1ST ST',
            'BWJ RD',
            'FOX ST'
          ]
        })
      });
    });

    await page.goto('/test_street_autocomplete_short_names.html');
    await page.waitForLoadState('networkidle');
    
    await page.waitForFunction(() => {
      return window.StreetAutocompleteOptimized !== undefined;
    }, { timeout: 5000 });

    // Load streets
    await page.click('#btnLoadStreets');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnTest1Char');
      return btn && !btn.disabled;
    }, { timeout: 5000 });

    const streetInput = page.locator('#street');
    const houseInput = page.locator('#house');

    // Initially house should be disabled
    await expect(houseInput).toBeDisabled();

    // Type 1 character
    await streetInput.fill('B');
    await streetInput.dispatchEvent('input');
    await page.waitForTimeout(100);
    await expect(houseInput).toBeDisabled();

    // Type 2 characters
    await streetInput.fill('BW');
    await streetInput.dispatchEvent('input');
    await page.waitForTimeout(100);
    await expect(houseInput).toBeDisabled();

    // Type 3 characters - house should now be enabled
    await streetInput.fill('BWJ');
    await streetInput.dispatchEvent('input');
    await page.waitForTimeout(200);
    await expect(houseInput).toBeEnabled();
  });

  test('should show short streets immediately but require 2 chars for longer streets', async ({ page }) => {
    // Mock the /api/streets endpoint with mix of short and long streets
    await page.route('**/api/streets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          streets: [
            '1ST ST',
            'A AVE',
            'ADAMS ST',
            'BRADLEY AVE',
            'CANBY ST'
          ]
        })
      });
    });

    await page.goto('/test_street_autocomplete_short_names.html');
    await page.waitForLoadState('networkidle');
    
    await page.waitForFunction(() => {
      return window.StreetAutocompleteOptimized !== undefined;
    }, { timeout: 5000 });

    // Load streets
    await page.click('#btnLoadStreets');
    await page.waitForFunction(() => {
      const btn = document.getElementById('btnTest1Char');
      return btn && !btn.disabled;
    }, { timeout: 5000 });

    const streetInput = page.locator('#street');

    // Type "A" - should show "A AVE" but NOT "ADAMS ST"
    await streetInput.fill('A');
    await streetInput.dispatchEvent('input');
    await page.waitForTimeout(200);

    let suggestions = page.locator('.autocomplete-suggestion[data-street]');
    let suggestionTexts = await suggestions.allTextContents();
    
    // Should show "A AVE" (short street)
    expect(suggestionTexts.some(text => text.includes('A AVE'))).toBeTruthy();
    // Should NOT show "ADAMS ST" (longer street, needs 2 chars)
    expect(suggestionTexts.some(text => text === 'ADAMS ST')).toBeFalsy();

    // Type "AD" - now should show "ADAMS ST"
    await streetInput.fill('AD');
    await streetInput.dispatchEvent('input');
    await page.waitForTimeout(200);

    suggestions = page.locator('.autocomplete-suggestion[data-street]');
    suggestionTexts = await suggestions.allTextContents();
    
    // Should now show "ADAMS ST"
    expect(suggestionTexts.some(text => text.includes('ADAMS ST'))).toBeTruthy();
  });
});
