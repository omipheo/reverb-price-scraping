# Pricing Tool Updates — Database Check, Questions & Instructions

Based on checking the MongoDB database and the codebase, here is what we have, what we don’t, and what to clarify with the client before building.

---

## 1. What the database currently has (MongoDB `pedal_prices_v2.products`)

| Field | Description | Used for |
|-------|-------------|----------|
| `canonicalProductId` | Reverb product ID | Linking, URLs |
| `title` | Product name | Display, matching |
| `brand` | Brand name | Display |
| `slug` | URL slug | Can build Reverb links |
| `normalizedTitle` | Normalized name | Matching |
| `hasPriceGuide` | True if we have transaction data | Filtering |
| `priceGuide` | Array of up to 200 transactions | Sold prices |
| `priceGuideSummary` | `all`: count, median, average, low, high, lastSoldAt; `byCondition` | Fast lookup |

**Each transaction in `priceGuide` has:**
- `condition` (e.g. "Used", "Mint")
- `amount` (sale price)
- `listingId`
- `createdAt` (timestamp)

So: **we already have sold/transaction data**. The Price Guide we scrape is Reverb’s historical sold listings. We do **not** have a separate “sold listings” scrape; this is it.

---

## 2. What we can do with current data (no new scrape)

- **Reverb historical price** — Already computed (middle transactions + discount). Just rename to “Reverb historical price”.
- **Reverb Sold Price (2nd to lowest)** — We can compute this from `priceGuide`: sort by `amount`, take the 2nd lowest. No new scrape.
- **Reverb historical price link** — We have `slug` and `canonicalProductId`. We can build a link once we confirm Reverb’s URL pattern (e.g. `https://reverb.com/p/{slug}` or price-guide URL).
- **Reverb Sold Price link** — Same: we can try to build from `slug`/`canonicalProductId` or listingId; need to confirm exact URL with Reverb.

---

## 3. What we do NOT have (new work or new data)

| Need | Status | Notes |
|------|--------|------|
| **PTM Buy Price (editable)** | Not in DB | Need schema + API: store override price, who changed it, and expiration (1 year from change). |
| **Buy Price Expiration** | Not in DB | Derive from “last buy price set/updated” + 1 year. |
| **Quantity for sale on Reverb** | Not in DB | Current scrape is Price Guide (sold), not “current listings count”. Need different Reverb API or scrape for “used listings count” per product. |
| **Reverb suggested sell price** | Not stored | Scrape requests `includePriceRecommendations: true` and gets `priceLow`/`priceHigh`, but we **do not save** that to MongoDB. We could: (a) add to schema and save on next scrape, or (b) fetch when needed (slower). |
| **PTM Sell Price (editable)** | Not in DB | Same idea as buy price: override + last updated + expiration. |
| **Sell Price Expiration** | Not in DB | Only when user overrides sell price; 1 year from that override. |

---

## 4. Questions for the client (ask before building)

### A. Reverb Sold Price & links
1. **Reverb Sold Price = “2nd to lowest” among sold listings**  
   We have this data (transaction history). Confirm: use our existing sold/transaction data and take 2nd lowest price as “Reverb Sold Price”? (No new scrape needed.)
2. **Reverb historical price link**  
   Should this go to Reverb’s price guide page for this product, or a generic product page? (We have `slug` and `canonicalProductId` to build URLs.)
3. **Reverb Sold Price link**  
   Should this point to a “sold listings” filter for this product on Reverb? Do you have an example URL you want us to match?

### B. Quantity for sale on Reverb
4. We **do not** have “number of used listings currently for sale” in the DB. Getting it would require:
   - A different Reverb API/search that returns “current listings count” for a product, or
   - Scraping the “used” filter count (e.g. the “297 used” number).
   - **Question:** Is this required for v1, or can we ship without it and add later? If required, are you okay with us researching Reverb’s site/API for “current used count”?

### C. Sell price calculation (logic clarity)
5. **“Highest price from transaction history”**  
   We have this: `priceGuideSummary.all.high`. Confirm that’s the “highest price” you mean.
6. **“Highest price from Reverb suggested sell price”**  
   We can get “suggested” price (priceLow/priceHigh) from Reverb when we search, but we don’t store it today. Should we:
   - (a) Start storing it in the DB (schema change + save in scrape), or  
   - (b) Fetch it on demand when the user looks at a product (slower, no schema change)?
7. **“End in 9” rule**  
   You said “the 9 that is closest to 10%” and gave 100→109, 105→119. For 105 + 10% = 115.5: should we round to **109** or **119**? Can you confirm the rule: always round up to next X9, or round to nearest X9?
8. **Sell price tiers**  
   You have different rules for “6+ for sale” vs “5 or fewer”. We don’t have “quantity for sale” yet. Should we:
   - (a) Implement sell price logic **without** the “6+ vs 5 or fewer” part first (e.g. assume “6+”), and add quantity later, or  
   - (b) Wait until we have quantity for sale before implementing the full sell price logic?

### D. PTM Buy Price & new pedals
9. When a user adds a **new pedal** that doesn’t exist in the DB: should it be stored as a “user-added product” with only name + PTM Buy Price (and optional expiration), and no Reverb data until we eventually match it or scrape it?
10. When a user **edits** PTM Buy Price on an existing product: should we keep the existing Reverb historical price (and other Reverb fields) and only change PTM Buy Price and expiration?
11. **Audit:** Do you need a log of who changed what price and when (for PTM Buy Price and PTM Sell Price)?

### E. Totals and FMV
12. You said: “The tool should only add up all of the PTM Buy Prices and then run the formula to calculate the FMV.”  
   Confirm: FMV is computed only from the **sum of PTM Buy Prices** (no Reverb historical or sold price in the FMV formula)? And the “formula” is the same as today (e.g. FMV = total * X, offer = total * Y)?

### F. Column order and renames
13. Confirm final column order and names:
    - Pedal Name  
    - PTM Buy Price (editable)  
    - Buy Price Expiration  
    - Reverb historical price  
    - Reverb historical price link  
    - Reverb Sold Price  
    - Reverb Sold Price link  
    - Quantity for sale on Reverb  
    - PTM Sell price (editable)  
    - Sell Price Expiration Date  

---

## 5. Instructions for you (before development)

1. **Share this document (or a short version) with the client**  
   Use the questions above so they can answer in one place. Optionally turn the “what we have / what we don’t” into a short summary for them.

2. **Confirm Reverb URL patterns**  
   - Open a Reverb product page and price guide in the browser.  
   - Note the exact URLs (e.g. `https://reverb.com/p/...`, `https://reverb.com/price-guide/...`).  
   - Confirm with client which link should go to “Reverb historical price” and which to “Reverb Sold Price” (if different).

3. **Decide on “quantity for sale”**  
   - If client says it’s required: research how to get “current used listings count” (Reverb API or scrape).  
   - If optional: document “Quantity for sale: TBD” and implement the rest.

4. **Document sell price rules in one place**  
   - One table or flowchart: for each case (6+ vs 5 or fewer, 91+ vs 90 or lower, transaction vs suggested price), which percentage and “end in 9” rule applies.  
   - Get client sign-off on that table so implementation is unambiguous.

5. **Schema and API plan**  
   - List new collections or new fields (e.g. `ptmBuyPrice`, `ptmBuyPriceExpiresAt`, `ptmSellPrice`, `ptmSellPriceExpiresAt`, and optionally `priceRecommendations` if we store them).  
   - Plan API endpoints: e.g. “update PTM Buy Price”, “add new pedal”, “update PTM Sell Price”.

6. **Estimate hours**  
   - After answers: estimate per area (DB + API, front-end columns and edits, Reverb links, sold price calc, sell price calc, quantity if needed, testing).  
   - Share estimate with client and get approval before coding.

---

## 6. Summary for the client (short version)

- **We already have** Reverb historical (sold) transaction data. “Reverb Sold Price” as 2nd-to-lowest can be done from current DB; no new scrape for that.
- **We do not have** “quantity for sale” or stored “Reverb suggested sell price”; both need a decision (required or not, and how to get/stored).
- **We need to add** storage and UI for: PTM Buy Price (editable), Buy Price Expiration, PTM Sell Price (editable), Sell Price Expiration, and possibly Reverb suggested sell price and quantity for sale.
- **Before building:** please answer the questions in Section 4 so we can implement the sell price logic and links correctly and avoid rework.

Once you have the client’s answers, you can turn this into a short “spec” and then implement step by step.
