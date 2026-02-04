# Justin Pricing Spreadsheet — Cleaning Focus

This document is only about **justin pricing spreadsheet.xlsx** and the cleaning script. It does not cover the pricing tool, MongoDB, or other features.

---

## 1. How the script assumes the spreadsheet is laid out

The script reads **Sheet1** and uses columns A–H like this:

| Column | Used for |
|--------|----------|
| **A** | Person name (when it looks like a name) **or** pedal name (when it looks like a pedal) |
| **B** | Date (≥ 2025-07-24) when row is a person **or** price when row is pedal (A = pedal) |
| **C** | Fallback price if B is not a valid price (when A = pedal) |
| **D** | Pedal name (second “column” of pedals) |
| **E** | Price for pedal in D |
| **F** | Fallback price for D **or** pedal name (third column) |
| **G** | Price for pedal in F |
| **H** | Price only; pedal name is taken from A or D |

So the script assumes:
- Rows alternate or group by **person** (name in A, date in B).
- Under each person, pedals appear in **up to three columns**: (A,B/C), (D,E/F), (F,G), and sometimes price-only in H with pedal from A or D.

---

## 2. What the cleaning script does (step by step)

1. **Detects person rows**  
   - Column A looks like a person (2–4 title-case words, no digits, first name in a common-name list).  
   - Column B is a date ≥ 2025-07-24.  
   → Sets “current person” and “current date” for following rows.

2. **Detects pedal rows**  
   - Column A, D, or F contains text that looks like a pedal (pedal-related/brand keywords, or long enough mixed-case text).  
   - Skips if it looks like “total”, “fmv”, “$20 less”, “label”, “needs”, “for lot”, “payout”.

3. **Finds price**  
   - For pedal in A: price in B, else C.  
   - For pedal in D: price in E, else F.  
   - For pedal in F: price in G.  
   - If H has a number and looks like a price, uses H and takes pedal name from A or D.  
   - Treats numbers in 1–9999 as prices.  
   - If Excel stored a number as a date (e.g. 20 → 1900-01-20), script converts that date’s **day** to the price (e.g. 20).

4. **Cleans pedal name**  
   - Strips leading `-`, `.`, `*`, list numbers (`1.`, `1)`), extra spaces.  
   - Removes phrases like “with box”, “no box”, “in mint condition”, and everything in parentheses.  
   - Trims and strips trailing `.` or `,`.

5. **Extracts condition**  
   - Looks for “mint”, “excellent”, “very good”, “good”, “fair” (with or without “condition”) in the **original** cell text and stores that as condition.

6. **Output**  
   - One row per pedal: `pedal_name`, `condition`, `price`, `date`, `expiration_date` (date + 1 year), `original_description`.  
   - Saves: `cleaned_pedal_pricing.xlsx`, `cleaned_pedal_pricing.csv`, `cleaned_pedal_pricing_with_descriptions.xlsx`, and optionally `duplicate_analysis.xlsx`.

---

## 3. Questions to align cleaning with the real spreadsheet

Ask yourself (or the client) these **only** about **justin pricing spreadsheet.xlsx**:

1. **Layout**  
   - Is Sheet1 the only sheet that should be cleaned, or are there other sheets with pedal lists?  
   - Are pedals always in the pattern (A,B), (D,E), (F,G) and sometimes H, or are there different layouts (e.g. pedals only in A with price in B)?

2. **Person vs pedal**  
   - Are “person” rows always “Name in A, date in B” with no pedal keywords in A?  
   - Any person names that contain brand/model words (e.g. “Boss”)? If yes, the script might treat them as pedals; we may need to adjust or add exceptions.

3. **Prices**  
   - Are all prices in the 1–9999 range, or do you need support for 0 or ≥ 10000?  
   - Are there any prices stored as dates in Excel (e.g. 20 showing as a date)? The script already converts “date with day = price” to that number; confirm that’s correct.

4. **Pedal names**  
   - Should everything in parentheses always be removed from the pedal name (e.g. “Pedal (rare)”), or are there cases to keep?  
   - Are there brands or models that appear in the sheet but are missing from the script’s `pedal_indicators` list and get missed as pedals?

5. **Condition**  
   - Is condition always in the same cell as the pedal text, or sometimes in another column? The script only looks in the pedal cell.

6. **Rows to ignore**  
   - Besides “total”, “fmv”, “$20 less”, “label”, “needs”, “for lot”, “payout”, are there other header/total rows that should never be treated as pedals?

---

## 4. Instructions when working on cleaning

1. **Run the cleaner**  
   - Put **justin pricing spreadsheet.xlsx** in the project root.  
   - Run:  
     `python3 scripts/clean-pedal-pricing.py`  
   - Check console output and the generated files.

2. **Check outputs**  
   - Open **cleaned_pedal_pricing_with_descriptions.xlsx** and compare `pedal_name` and `original_description` to the same rows in **justin pricing spreadsheet.xlsx**.  
   - Use **duplicate_analysis.xlsx** to review pedals that appear more than once with different prices.

3. **Find missed or wrong rows**  
   - Look for:  
     - Rows that are pedals in the original but missing in the cleaned file.  
     - Rows that are persons or totals but appear as pedals.  
     - Wrong price (e.g. date misinterpreted, or price in wrong column).  
   - Note the row number and column in the original sheet so you can adjust the script or the spreadsheet.

4. **Improve the script if needed**  
   - Add or change **person** logic in `is_person_name_simple()` if person rows are misclassified.  
   - Add or change **pedal** logic in `is_pedal_name()` and `clean_pedal_name()` if pedal names are missed or over-cleaned.  
   - Adjust **price** logic (e.g. which column pairs to use) if your layout differs from what’s in Section 1.

5. **Keep the spreadsheet consistent**  
   - If the client can standardize the layout (e.g. always “Person in A, date in B”, then pedals in A/D/F with price in B/E/G), cleaning will be more reliable.

---

## 5. Quick reference: input vs output

- **Input:** `justin pricing spreadsheet.xlsx` (Sheet1, columns A–H).  
- **Output:**  
  - `cleaned_pedal_pricing.xlsx` — cleaned rows, no original text.  
  - `cleaned_pedal_pricing_with_descriptions.xlsx` — same + `original_description`.  
  - `cleaned_pedal_pricing.csv` — same as first, CSV.  
  - `duplicate_analysis.xlsx` — pedals with multiple entries and price stats.  
- **Script:** `scripts/clean-pedal-pricing.py` (no MongoDB or pricing tool logic).

If you tell me the exact layout of a few sample rows (e.g. “row 5: A=person, B=date; row 6: A=pedal, B=price”), I can help adjust the script or the questions so cleaning matches **justin pricing spreadsheet.xlsx** only.
