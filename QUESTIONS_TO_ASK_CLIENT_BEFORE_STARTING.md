# Questions to Ask Client Before Starting

Use this when you reply to the client. It covers: (1) the pricing tool updates, (2) their questions about AI matching and Moltbot. **Note:** Client has already reviewed **pricing_comparison.xlsx**; their feedback is in the Pricing Tool Updates doc.

---

## Part 1: Your reply — short opening

You can say something like:

- Thanks for the update; good to hear there’s more to do on the pricing tool.
- I’ve gone through the Pricing Tool Updates doc and the Moltbot/matching questions. Before I build anything, I need a few clarifications.
- I’ve listed everything below. Once I have your answers, I can give a time estimate (and will do a bit of research where needed).

---

## Part 2: Feedback on pricing_comparison.xlsx (cleaning data)

**Update:** Client has already reviewed **pricing_comparison.xlsx** and sent their feedback in the Pricing Tool Updates doc. Skip asking for comparison-file feedback.

~~1. **Did you have a chance to review pricing_comparison.xlsx?**~~
~~2. **Any rows that look wrong?**~~ (e.g. pedal name wrong, price wrong, missing, or duplicate.)
~~3. **Any columns or sheets you’d like added or changed** for the next time we run this kind of comparison?~~

If you need to ask again later: any rows wrong? any columns/sheets to add or change for the next comparison run?

---

## Part 3: Their question — “Train the AI on matching / column to check off doesn’t match”

**Answer you can give:**

- Yes. We can add a column (e.g. “Match correct?”) with a checkbox or options like: **Match correct / Wrong match / No match**.
- When someone marks “Wrong match” or “No match,” we can store that (e.g. in a table) and use it later to improve matching (e.g. synonyms, spelling, or manual overrides).
- No need to “train AI” in the heavy sense — we can use this feedback as rules and overrides so the tool gets better over time.

**Question back to them:**

- Should this feedback be **only for the comparison/review process** (e.g. in pricing_comparison.xlsx or a similar export), or do you also want it **inside the live pricing tool** when someone searches a pedal (e.g. “This match is wrong” button)?

---

## Part 4: Their questions — Moltbot, hosting, front end, GHL

**Answers you can give:**

- **Setup (Ionos vs Hostinger):** Both can work. I’ll choose based on: cost, ease of setup, and whether we need it to talk to our app. I can give a short recommendation once I’ve checked the Moltbot tutorial (e.g. Hostinger one they sent).
- **Front end:** Moltbot usually comes with its own chat/dashboard. You typically don’t need a custom front end just to “access” it — unless you want it embedded in your pricing tool site.
- **GHL subaccounts:** You mentioned the ChatGPT agent didn’t do it well and that if Moltbot takes more than 1–2 hours to set up it’s probably not worth deep research. I’ll only spend 1–2 hours on: setup + a quick test for GHL-style tasks. If it clearly doesn’t help for GHL, I’ll stop and report back rather than digging deeper.

**Question back to them:**

- Should I **prioritize the pricing tool work** and only try Moltbot in parallel (within that 1–2 hour cap), or do you want Moltbot tried first before we lock the pricing tool scope?

---

## Part 5: Pricing Tool Updates — questions before building

These are the questions you **must** ask so you’re on the same page. You can send them in an email or go through them on a call.

### Data and Reverb

1. **Reverb Sold Price = “2nd to lowest” sold price**  
   We already have sold/transaction data in the DB (from the Price Guide). Can we use that and take the **2nd lowest** price as “Reverb Sold Price” so we don’t need a new scrape?

2. **Reverb links**  
   For “Reverb historical price link” and “Reverb Sold Price link” — do you have example Reverb URLs you want (e.g. price guide page vs product page vs sold listings)? We have product ID and slug; we need to match the exact URL format you want.

3. **Quantity for sale on Reverb**  
   We don’t currently have “how many used are for sale right now.” Getting it means extra Reverb research/API or scraping. Is this **required for the first version**, or can we launch without it and add it later?

4. **Reverb “suggested sell price”**  
   We can get Reverb’s suggested price when we search, but we don’t store it yet. Prefer we **(a)** add it to the DB on the next scrape, or **(b)** fetch it when the user looks at a product (simpler but slower)?

### Sell price rules

5. **“End in 9”**  
   For “the 9 that is closest to 10%”: e.g. 105 + 10% = 115.5 — should we show **109** or **119**? Rule: always round **up** to the next X9, or round to **nearest** X9?

6. **Sell price when we don’t have “quantity for sale”**  
   Your rules depend on “6+ vs 5 or fewer” used for sale. If we don’t have that number yet, should we **(a)** use a default (e.g. assume “6+”) and add quantity later, or **(b)** wait until we have quantity before implementing the full sell price logic?

### PTM Buy Price / new pedals

7. **New pedal (not in DB)**  
   When someone adds a new pedal and optionally a price: confirm we should save **pedal name + PTM Buy Price (if entered) + expiration (1 year from that date)**. And they can add a pedal with **no** price if they want?

8. **Editing PTM Buy Price**  
   When someone changes the buy price, we update that price and set “Buy Price Expiration” to 1 year from the change. Should we also keep a **history** of who changed what and when (for audit)?

### FMV and totals

9. **FMV**  
   You said the tool should add up **only** the PTM Buy Prices and then run the formula for FMV. Confirm: FMV is based **only** on the sum of PTM Buy Prices (not Reverb historical or sold price), and the formula itself stays as it is today?

### Column order

10. **Final column order**  
    Confirm this is the order you want in the tool:

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

## Part 6: Time estimate

You can say:

- I’ll do some research (Reverb links, quantity-for-sale if needed, Moltbot tutorial).
- Once I have your answers above, I’ll send a **time estimate** (in hours) for the pricing tool work, broken down by: renames/editable buy price, expiration, Reverb columns and links, sell price logic, quantity (if v1), and any matching feedback column.
- If you want Moltbot tried within 1–2 hours, I’ll include that separately so it doesn’t block the pricing tool estimate.

---

## Part 7: Checklist before you start

- [x] Client’s feedback on **pricing_comparison.xlsx** (already received in Pricing Tool Updates doc)
- [ ] Client’s preference on **matching feedback**: comparison file only, or also in live tool
- [ ] Client’s priority: **pricing tool first** vs Moltbot first (and 1–2 hr cap on Moltbot)
- [ ] All **Pricing Tool Updates** questions above answered
- [ ] You’ve confirmed Reverb URL format and (if needed) quantity-for-sale approach
- [ ] You’ve sent a **time estimate** after answers

---

## Short email version (if you prefer one short message)

You can condense to:

- Thanks for the update and the doc. I’ve read through everything and have a few questions so we’re aligned before I build.
- **Matching:** We can add a “Match correct? / Wrong match / No match” column and use that to improve matching over time. Do you want this only in the comparison export or also in the live tool?
- **Moltbot:** I’ll only spend 1–2 hours on setup + a quick GHL-style test. If it’s not clearly better than the ChatGPT agent, I’ll stop and focus on the pricing tool. Prefer I do pricing tool first and Moltbot in parallel (within that cap)?
- **Pricing tool:** I have about 10 short questions on the Pricing Tool Updates (Reverb data, sell price rules, “end in 9,” quantity for sale, FMV, column order). I’ll send them in a separate list so you can answer when convenient.
- Once I have your answers, I’ll send a time estimate for the pricing tool work.

Then attach or paste the full list from **Part 5** (and optionally Part 2) from this file.

---

You can copy from this file into your email or meeting notes and adjust wording to match your style.
