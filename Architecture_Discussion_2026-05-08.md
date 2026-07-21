# Reverb Pricing Tool — Architecture Discussion

**Date:** May 8, 2026
**Topic:** Integrating client spreadsheet with global Reverb product database

---

## Recommended approach

### 1. Use Reverb's product ID as the canonical key

We already have unique product IDs for ~94,000 Reverb products in our global database. These IDs are stable and unique. Use them as the "join key" between the client spreadsheet and the global database.

Every spreadsheet row maps to exactly one product ID.

---

### 2. Don't duplicate data — split by purpose

| Source | Owns |
|---|---|
| **Global database** (Reverb data) | Make, Model, transactions, PG Hist Price, market sold price, live listings count, slug, brand |
| **Client spreadsheet** | Per-product price overrides: FMV, List Price, Buy Price |

The tool reads from both sources and merges them at display time. No data lives in two places.

---

### 3. Display priority — per field

When the tool shows results, it picks values in this order:

| Field shown | First check | Fallback |
|---|---|---|
| FMV | Spreadsheet value | Reverb PG Hist Price |
| List Price | Spreadsheet value | (formula TBD) |
| Buy Price | Calculated from FMV via buy rules | - |
| Live Listings | Daily-synced count | - |
| Make / Model | Reverb (canonical) | - |
| Reverb PG Link | Reverb product page | - |

This way the spreadsheet provides overrides without losing access to Reverb's underlying data.

---

### 4. Linking spreadsheet rows to global DB

Every spreadsheet pedal needs to be tied to a Reverb product ID. Process:

1. **Auto-link via matcher** — our existing matching engine + Claude fallback handles ~95% of pedals correctly.
2. **Admin manually links** the ~5% that don't auto-match.
3. **New pedals not in global DB** — create new product entries via the "Add Pedal to DB" checkbox.

The Model ID assigned via "Add Pedal to DB" becomes the new canonical ID for that pedal in both places.

---

### 5. Sync directions

| Direction | What syncs | Frequency |
|---|---|---|
| Reverb → Global DB | New products, prices, live listings | Daily scrape |
| Spreadsheet → Tool | Price overrides | Real-time via webhook |
| Tool → Spreadsheet | New pedals (via "Add Pedal to DB") | On user save |
| Global DB → Spreadsheet | Live listings count (per product) | Daily |

The "no-delete" rule from the original spec applies: if a price is removed from the spreadsheet, the tool does NOT update — only updates when replaced with a new value.

---

## Key questions to align on

### Q1. Which prices stay in Reverb vs go to spreadsheet?

**Suggested split:**
- **Spreadsheet owns:** FMV, List Price, Buy Price overrides
- **Reverb (global DB) owns:** Hist Price, market sold data, live listings count

This avoids duplication. Each price has one source of truth.

### Q2. What's the "global product ID"?

**Suggested:** Use the existing Reverb canonical product IDs. They are already unique, stable, and tied to Reverb's API. No need to invent a new ID system.

For pedals not on Reverb (custom entries), use a prefix like `manual-<uuid>` to distinguish.

### Q3. What happens when Reverb adds a new pedal?

Auto-imported into the global DB on the daily scrape. The client can choose to add it to the spreadsheet by linking it via the tool.

### Q4. What happens when the client adds a pedal not on Reverb?

Create a new product entry in the global DB with a custom ID (`manual-<uuid>`). No Reverb data attached — only the data the client provides on the spreadsheet.

### Q5. Match link vs no-match handling

- **Linked rows:** Spreadsheet row tied to a product ID. Edits sync both ways.
- **Unlinked rows:** Spreadsheet row exists but no auto-match found. Admin must link manually or mark as "create new".
- **Tool-side no-match:** User types a pedal name, no match in DB or spreadsheet. Falls through to Claude AI. If still no match, user can flag it (No Match checkbox).

---

## Bottom line

Make **Reverb the canonical product registry** (Make, Model, identifiers, market data). Make the **spreadsheet a thin layer of price overrides** tied to product IDs. This avoids duplication, keeps each source clean, and lets both grow independently.

The tool's job is to **merge them at display time** based on the per-field priority rules above.

---

## Next steps (once aligned)

1. Confirm the architecture above with the client
2. Finalize column mapping for the spreadsheet integration
3. Set up Microsoft Graph OAuth for OneDrive access
4. Run a one-time import of current spreadsheet data
5. Wire up real-time sync (webhook + polling fallback)
6. Add the "Add Pedal to DB" workflow in the tool UI
