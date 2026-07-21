# PTM MS360 Playwright POC — Handoff Document

Last updated: 2026-07-24

## Purpose

Prove that a Playwright script can automatically create a pedal listing on MS360 (Music Shop 360) admin panel for the client "Pedals to Metal", using Boss TU-3 as the test case. Once the POC works, Dovid (my client, project manager) will show Evan (the pedal store owner) to get approval for the full pedal listing automation project.

## Project context

**Client hierarchy:**
- Me (TechPhoenix) = developer
- Dovid Levy = my direct client / project manager
- Evan Lahasky = end client, owns the pedal store "Pedals to Metal"

**Business setup:**
- Evan's pedal shop uses **Music Shop 360 (MS360)** as their POS + e-commerce platform
- MS360 has a built-in Reverb integration — when a product is saved with a Reverb Price, MS360 auto-syncs to Reverb
- Storefront: pedalstometal.musicshop360.com
- Admin: admin.musicshop360.com (login), then pedalstometal.musicshop360.com/site-configuration/... for store-specific admin

**End goal (larger project, pending Evan approval):**
- Phone/web app captures pedal photos + SKU
- Backend pipeline: PhotoRoom (bg removal) → Cloudinary (image hosting) → MS360 (creates listing)
- Also push to eBay + Sweetwater Gear Exchange via API
- Cross-platform delisting when sold on any channel

**Current scope (this POC):**
Just the MS360 → Reverb piece. If Playwright can log in, create a product with images, and trigger the Reverb push end-to-end, the concept is proven.

## Simplified scope per Dovid (7/16/2026)

- User manually enters SKU (no auto-generation logic needed)
- User can enter SKU first, then scan barcode / upload images / create folder named with SKU
- POC just needs to prove the MS360 side of automation works

## Credentials

**MS360 admin:**
- Login URL: https://admin.musicshop360.com/
- Username: evanlahasky90@gmail.com
- Password: Washburnd10s!
- After login redirects to: admin.musicshop360.com/site-configuration/main/home.php
- Store-specific admin: pedalstometal.musicshop360.com/site-configuration/main/home.php

## Google tracking (separate task, already DONE)

For context, these were installed on the pedalstometal storefront:
- GA4 Measurement ID: G-4QX1R5PPJE
- GTM Container ID: GTM-KVRG6KS2
- Clarity Project ID: xmy31vn7oa
- Search Console: verified via HTML meta tag
- Google account: info@pedalstometal.net (client owns via IONOS webmail)
- All scripts installed in MS360 → Global Css and Js → JavaScript tab
- Search Console meta tag added to Header Links tab (or as HTML injection)

Not relevant to the POC directly, but part of the same larger PTM project.

## Environment

- OS: Windows (Git Bash / MINGW64)
- Working directory: `E:/Workspace/DavidLevy/ptm-ms360-poc`
- Node.js: installed
- Playwright: installed (`@playwright/test`)
- Chromium: installed via `npx playwright install chromium`

## Files in project folder

```
ptm-ms360-poc/
├── node_modules/
├── package.json
├── package-lock.json
├── smoke.spec.js               ← simple Google test, already passing
├── poc.spec.js                 ← main POC script (partially written)
├── ms360-selectors.md          ← selector notes for MS360 elements
└── test-images/                ← 6 Boss TU-3 test images
    ├── tu3-1.jpg (renamed from hash filenames)
    ├── tu3-2.jpg
    ├── tu3-3.jpg
    ├── tu3-4.jpg
    ├── tu3-5.jpg
    └── tu3-6.jpg
```

## Progress so far

### ✅ Done
1. Node + Playwright installed and verified working (smoke test passes)
2. Test images downloaded (6 Boss TU-3 photos from Reverb)
3. `ms360-selectors.md` file created
4. Login page HTML captured — selectors extracted:
   - Username: `#username`
   - Password: `#password`
   - Submit: `#submitBtn`
   - Form action: POST /site-configuration/auth/login-process.php
5. Login flow confirmed working manually (admin.musicshop360.com/site-configuration/auth/login.php → admin.musicshop360.com/site-configuration/main/home.php)

### 🔴 In progress
1. Manual walkthrough of MS360 New Product form to gather remaining selectors
2. Writing the full Playwright script in `poc.spec.js`

### 🔴 Not started
1. Actually creating a test product manually in MS360 to verify the flow works
2. Confirming whether MS360 auto-pushes to Reverb on save (or needs a separate button)
3. Testing the full Playwright automation end-to-end
4. Verifying the listing appears on Reverb
5. Cleaning up test data after verification

## Selectors gathered so far

Copy this into `ms360-selectors.md`:

```markdown
# MS360 Automation Selectors

## Login flow
- Login URL: https://admin.musicshop360.com/site-configuration/auth/login.php
- Username field: #username
- Password field: #password
- Submit button: #submitBtn
- After login redirects to: https://admin.musicshop360.com/site-configuration/main/home.php
- Store-specific admin: https://pedalstometal.musicshop360.com/site-configuration/main/home.php

## Products list page
- URL: https://pedalstometal.musicshop360.com/site-configuration/products/list.php
- "+ Create New" button: [TODO]
- "New Product" dropdown option: [TODO]

## Add Product form — Details tab
- Product Title field: [TODO]
- Category "Edit" button: [TODO]
- Category modal "Pedals" checkbox: [TODO]
- Category modal "Close" button: [TODO]
- Manufacturer dropdown: [TODO]
- Make field: [TODO]
- Model field: [TODO]

## Styles & Pricing section
- UPC field: [TODO]
- SKU field: [TODO]
- Default Cost field: [TODO]
- Price field: [TODO]
- Reverb Price field: [TODO]
- Condition dropdown: [TODO]

## Images tab
- Tab link: [TODO]
- "Select from computer" radio: [TODO]
- Hidden file input: [TODO]

## Descriptions tab
- Tab link: [TODO]
- Long Description editor: [TODO]

## Save
- Save Product button: [TODO]
- Success message text or selector: [TODO]

## Reverb sync behavior
- Automatic on save? (Y/N): [TODO — test manually]
- If separate button, selector: [TODO]

## Notes / quirks
- MS360 admin has a generic admin.musicshop360.com/site-configuration/main/home.php page
  that shows "We are busy working on it" — this is not the real admin
- Store-specific admin is at pedalstometal.musicshop360.com/site-configuration/...
- MS360 uses Bootstrap CSS (confirmed by Dovid)
- Manual login flow: admin.musicshop360.com/site-configuration/auth/login.php → redirect
```

## Current Playwright script

Copy this into `poc.spec.js`:

```javascript
const { test, expect } = require('@playwright/test');
const path = require('path');

test('MS360 POC — create Boss TU-3 listing', async ({ page }) => {
  test.setTimeout(120_000); // 2 min total timeout

  // ==== 1. LOGIN ====
  await page.goto('https://admin.musicshop360.com/');
  await page.fill('#username', 'evanlahasky90@gmail.com');
  await page.fill('#password', 'Washburnd10s!');
  await page.click('#submitBtn');
  await page.waitForURL(/site-configuration/, { timeout: 15000 });
  console.log('✅ Logged in');

  // ==== 2. NAVIGATE TO PRODUCTS LIST ====
  await page.goto('https://pedalstometal.musicshop360.com/site-configuration/products/list.php');
  await page.waitForLoadState('networkidle');
  console.log('✅ Products page loaded');

  // ==== 3. CLICK "+ CREATE NEW" → "NEW PRODUCT" ====
  // TODO: fill selectors from ms360-selectors.md
  // await page.click('[+ Create New button selector]');
  // await page.click('[New Product option selector]');

  // ==== 4. FILL DETAILS TAB ====
  // TODO
  // await page.fill('[Product Title selector]', 'Boss TU-3 Chromatic Tuner Pedal - AUTOMATION TEST');
  // await page.click('[Category Edit button selector]');
  // await page.click('[Category "Pedals" selector]');
  // await page.click('[Category Close button selector]');
  // await page.selectOption('[Manufacturer dropdown selector]', 'Boss');
  // await page.fill('[Make field selector]', 'Boss');
  // await page.fill('[Model field selector]', 'TU-3');

  // ==== 5. FILL STYLES & PRICING ====
  // TODO
  // await page.fill('[UPC selector]', '761294427422');
  // await page.fill('[SKU selector]', 'PTM-TU3-TEST-001');
  // await page.fill('[Price selector]', '89.99');
  // await page.fill('[Reverb Price selector]', '89.99');
  // await page.selectOption('[Condition dropdown selector]', 'Excellent');

  // ==== 6. UPLOAD IMAGES ====
  // TODO
  // await page.click('[Images tab selector]');
  // await page.click('[Select from computer radio selector]');
  // const fileInput = page.locator('[file input selector]');
  // await fileInput.setInputFiles([
  //   path.resolve(__dirname, 'test-images/tu3-1.jpg'),
  //   path.resolve(__dirname, 'test-images/tu3-2.jpg'),
  //   path.resolve(__dirname, 'test-images/tu3-3.jpg'),
  // ]);

  // ==== 7. FILL DESCRIPTIONS ====
  // TODO
  // await page.click('[Descriptions tab selector]');
  // await page.fill('[Long Description selector]', 'Test listing from PTM automation POC - please delete');

  // ==== 8. SAVE PRODUCT ====
  // TODO
  // await page.click('[Save Product button selector]');
  // await page.waitForSelector('[success message selector]', { timeout: 15000 });
  // console.log('✅ Product saved');

  // ==== 9. TRIGGER REVERB PUSH (only if separate step needed) ====
  // TODO — test manually first to determine if this is needed

  // ==== 10. VERIFY LISTING APPEARS IN MS360 ====
  // TODO
  // await page.goto('https://pedalstometal.musicshop360.com/site-configuration/products/list.php');
  // await expect(page.locator('text=PTM-TU3-TEST-001')).toBeVisible({ timeout: 10000 });
  // console.log('✅ Listing verified in MS360');

  // ==== 11. SCREENSHOT FOR EVIDENCE ====
  await page.screenshot({ path: 'poc-final.png', fullPage: true });
  console.log('✅ Screenshot saved');
});
```

## Test values to use

When creating the test product (both manually and via Playwright):

| Field | Value |
|---|---|
| Product Title | `Boss TU-3 Chromatic Tuner Pedal - AUTOMATION TEST` |
| Category | Pedals |
| Manufacturer | Boss |
| Make | Boss |
| Model | TU-3 |
| UPC | `761294427422` (real Boss TU-3 UPC) |
| SKU | `PTM-TU3-TEST-001` |
| Price | `89.99` |
| Reverb Price | `89.99` |
| Condition | Excellent |
| Long Description | `Test listing from PTM automation POC - please delete` |
| Images | 1-3 files from `test-images/` folder |

## Next steps (in order)

### 1. Complete manual walkthrough (~1 hour)

Log in to MS360, navigate through the New Product flow, and record each selector in `ms360-selectors.md`. For each field:

1. Right-click element → **Inspect**
2. In DevTools, right-click highlighted HTML → **Copy → Copy selector**
3. Paste into `ms360-selectors.md`

**Preferred selector types (best to worst):**
- `#elementId` (best — uses ID)
- `input[name="fieldName"]` (very good — uses name attribute)
- `.someClass` (OK but classes can change)
- Long chain `body > div:nth-child(3) > ...` (fragile — avoid)

If a copied selector looks fragile, check the HTML for an `id` or `name` attribute and manually write a cleaner selector.

**Special cases:**
- File inputs: often hidden behind fancy buttons. Search DevTools for `type="file"` after clicking "Select from computer"
- Modals: inspect elements INSIDE the modal, not the button that opens it
- Rich text editors (Description): may be inside an iframe — Playwright needs `page.frameLocator()` for those

### 2. Manually create a test product (~15 min)

Before automating, actually create one test product manually using the test values above. This confirms:
- The flow works end-to-end
- MS360 auto-pushes to Reverb on save (or reveals a separate "push" button)

Wait 5-10 minutes after save, then check reverb.com for the SKU `PTM-TU3-TEST-001` or the title.

**Then delete the test product** (both from MS360 and Reverb if it pushed) to avoid polluting real inventory.

### 3. Fill in the Playwright script TODOs (~2-3 hours)

Replace each TODO in `poc.spec.js` with actual selector calls. Run the script after each addition:

```bash
npx playwright test poc.spec.js --headed --workers=1
```

`--headed` opens a visible browser so you can watch it run and debug.

Add `console.log('✅ ...')` after each step so terminal output shows progress.

### 4. Run end-to-end and verify (~30 min)

Once all TODOs are filled:
1. Run the script — should log all ✅ checkpoints
2. Screenshot final state
3. Manually verify the test product appears on Reverb (may take 5-10 min for sync)
4. Delete test data

### 5. Report to Dovid

Once POC passes, send Dovid:
- Screenshot of Playwright terminal output
- Screenshot of MS360 admin showing the automated listing
- Screenshot of Reverb showing the listing live
- Message: "POC works end-to-end. Ready to build the full project when Evan approves."

## Common issues to expect

| Issue | Fix |
|---|---|
| Login page uses different selectors than expected | Already captured: `#username`, `#password`, `#submitBtn` |
| MS360 uses iframes for the description editor | Use `page.frameLocator('iframe').fill(...)` |
| Image upload uses custom dialog | Target the hidden `input[type="file"]` with `setInputFiles()` |
| Slow save | Increase timeout: `waitForSelector(sel, { timeout: 30000 })` |
| Category modal doesn't close | Add explicit `await page.waitForSelector('[modal]', { state: 'hidden' })` |
| Reverb sync doesn't happen automatically | Look for a separate "Push to Reverb" or "Edit Upload" button |

## Cleanup checklist (after POC test)

- [ ] Delete test product from MS360 admin
- [ ] Delete test product from Reverb (if it pushed)
- [ ] Confirm no leftover test SKUs (`PTM-TU3-TEST-*`) in inventory

## Communication with Dovid

Dovid should not be pinged unless:
- You hit a blocker that needs his input (e.g., MS360 doesn't allow something)
- POC succeeds and you have evidence to share
- Something goes wrong with the client's real inventory

Otherwise, drive the POC to completion independently.

## Reference: original conversation with Dovid

Dovid's key guidance (from 7/12/2026 and 7/16/2026 messages):

> "to do a test you can just duplicate a listing of a boss Tu3 since they have alot in stock. So you can take the information (pictures, description) from the boss tu3 they already have on reverb and use it to test post on all the platforms."

> "for starters, let's get the initial part working and tested (like we discussed) to make sure it can work and is worth doing the rest of the project"

> "let me know once the test part works. I am looking for an opening to have the conversation with Evan about finalizing on the project."

> "we don't have to have the program figure out what the SKU will be and we may not have to deal with product ID's at all. In other words, it will be the users responsibility to know what that SKU number is and they will manually enter that into the program."

Dovid also noted (7/12/2026):

> "I'm thinking it will be best to upload to reverb independently so that if we ever stop using MS360 it will be easier to fix the code and not need brand new code for reverb."

**This is FUTURE scope**, not for this POC. This POC uses MS360's built-in Reverb sync. The independent Reverb integration comes later after Evan approves the full project.

## Related project files (not in POC folder)

If you need context on other parts of the PTM project, see the main working directory for reference notes. The POC folder is self-contained.

---

**Next Claude session, start here:**

1. Read this document
2. Read `ms360-selectors.md` to see what selectors are already captured
3. Read `poc.spec.js` to see current script state
4. Continue with "Next steps" section above
5. Focus on completing step 1 (manual walkthrough) first if selectors are still marked `[TODO]`
