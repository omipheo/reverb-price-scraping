import pandas as pd
import pymongo
from datetime import datetime
from pathlib import Path
import re
import sys

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True) if hasattr(sys.stdout, 'reconfigure') else None

# MongoDB connection
MONGO_URI = "mongodb://127.0.0.1:27017/pedal_prices_v2"

def normalize_pedal_name(name):
    """Normalize pedal name for matching (matches index.js logic)"""
    if not name:
        return ""

    # Convert to lowercase
    name = name.lower()

    # Remove condition words
    name = re.sub(r'\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b', ' ', name, flags=re.IGNORECASE)
    name = re.sub(r'\bcondition\b', ' ', name, flags=re.IGNORECASE)

    # Remove years (19xx or 20xx)
    name = re.sub(r'\b(19|20)\d{2}\b', ' ', name)

    # Remove parentheses content
    name = re.sub(r'\([^)]*\)', ' ', name)

    # Remove brackets content
    name = re.sub(r'\[[^\]]*\]', ' ', name)

    # Replace all non-alphanumeric with space
    name = re.sub(r'[^a-z0-9]+', ' ', name)

    # Collapse multiple spaces
    name = re.sub(r'\s+', ' ', name)

    return name.strip()

def normalize_condition(condition):
    """Normalize condition string for matching"""
    if not condition or not isinstance(condition, str):
        return None
    # Convert to title case
    return ' '.join(word.capitalize() for word in condition.lower().split())

def calculate_price_from_transactions(product, condition=None):
    """
    Calculate price from product transactions based on condition
    Implements the exact logic from index.js lines 105-193
    """
    if not product or 'priceGuide' not in product or not product['priceGuide']:
        return None, []

    # Sort transactions by createdAt (most recent first)
    sorted_transactions = sorted(
        product['priceGuide'],
        key=lambda x: x.get('createdAt', 0),
        reverse=True
    )

    relevant_transactions = []

    # Check if condition is a valid string (not None, not NaN, not empty)
    has_condition = isinstance(condition, str) and condition and condition != "Unknown"

    if has_condition:
        # Normalize condition for matching
        normalized_condition = normalize_condition(condition)

        # With condition: Get last 6 transactions in that specific condition
        for tx in sorted_transactions:
            tx_condition = normalize_condition(tx.get('condition'))
            if tx_condition == normalized_condition:
                relevant_transactions.append(tx)
                if len(relevant_transactions) >= 6:
                    break

        # Take average of middle 2 (remove first 2 and last 2, keep middle 2)
        if len(relevant_transactions) >= 6:
            relevant_transactions = relevant_transactions[2:4]  # Middle 2 (indices 2 and 3)
        elif len(relevant_transactions) >= 4:
            # If we have 4-5 transactions, take middle 2
            start = (len(relevant_transactions) - 2) // 2
            relevant_transactions = relevant_transactions[start:start + 2]
        # If less than 4, use all available
    else:
        # Without condition: Get last 14 non-mint transactions
        for tx in sorted_transactions:
            tx_condition = normalize_condition(tx.get('condition'))
            if tx_condition != "Mint":
                relevant_transactions.append(tx)
                if len(relevant_transactions) >= 14:
                    break

        # Take average of middle 6 (remove first 4 and last 4, keep middle 6)
        if len(relevant_transactions) >= 14:
            relevant_transactions = relevant_transactions[4:10]  # Middle 6 (indices 4-9)
        elif len(relevant_transactions) >= 10:
            # If we have 10-13 transactions, take middle 6
            start = (len(relevant_transactions) - 6) // 2
            relevant_transactions = relevant_transactions[start:start + 6]
        elif len(relevant_transactions) >= 6:
            # If we have 6-9 transactions, take middle 2-4
            start = (len(relevant_transactions) - 2) // 2
            relevant_transactions = relevant_transactions[start:start + 2]
        # If less than 6, use all available

    if not relevant_transactions:
        return None, []

    # Calculate average of the selected transactions
    amounts = [tx['amount'] for tx in relevant_transactions if isinstance(tx.get('amount'), (int, float))]

    if not amounts:
        return None, relevant_transactions

    average = sum(amounts) / len(amounts)

    # Apply discount based on price
    # For pedals over $200: lower by 5%
    # For pedals under $200: lower by 10%
    if average >= 200:
        adjusted_price = average * 0.95  # 5% discount
    else:
        adjusted_price = average * 0.90  # 10% discount

    return round(adjusted_price, 2), relevant_transactions

def filter_and_select_price(prices):
    """
    Filter outlier prices and select the appropriate price based on the rules:
    1. Remove lowest if $200 gap to 2nd lowest
    2. Remove highest if $200 gap to 2nd highest
    3. Use 2nd lowest price (after filtering) - but apply special logic if only 2 prices remain
    4. Flag for manual review based on criteria
    
    Returns: (selected_price, needs_manual_review, reason, all_prices_after_filter)
    """
    if not prices or len(prices) == 0:
        return None, False, None, []
    
    if len(prices) == 1:
        return prices[0], False, None, prices
    
    # Sort prices
    sorted_prices = sorted(prices)
    filtered_prices = sorted_prices.copy()
    
    # Step 1: Remove lowest if $200 gap to 2nd lowest
    if len(sorted_prices) >= 2:
        if sorted_prices[1] - sorted_prices[0] >= 200:
            filtered_prices = sorted_prices[1:]
    
    # Step 2: Remove highest if $200 gap to 2nd highest
    if len(filtered_prices) >= 2:
        if filtered_prices[-1] - filtered_prices[-2] >= 200:
            filtered_prices = filtered_prices[:-1]
    
    # If all prices were filtered out, use original lowest
    if len(filtered_prices) == 0:
        return sorted_prices[0], True, "All prices filtered as outliers", sorted_prices
    
    # Step 3: Special logic if only 2 prices remain
    if len(filtered_prices) == 2:
        lowest = filtered_prices[0]
        highest = filtered_prices[1]
        gap = highest - lowest
        
        # Check if difference between lowest and highest is >= $80
        if gap >= 80:
            return lowest, True, f"Price gap >= $80 (gap: ${gap:.2f})", filtered_prices
        
        # If highest <= $165
        if highest <= 165:
            if gap >= 21:
                return lowest, True, f"Highest <= $165 and gap >= $21 (gap: ${gap:.2f})", filtered_prices
            else:
                return lowest, False, None, filtered_prices  # Choose lowest
        # If highest >= $166
        else:
            if gap >= 31:
                return lowest, True, f"Highest >= $166 and gap >= $31 (gap: ${gap:.2f})", filtered_prices
            else:
                return lowest, False, None, filtered_prices  # Choose lowest
    
    # Step 4: Use 2nd lowest price (after filtering) for cases with 3+ prices
    if len(filtered_prices) == 1:
        return filtered_prices[0], False, None, filtered_prices
    else:
        # Use 2nd lowest (index 1)
        selected_price = filtered_prices[1]
        
        # Check if difference between lowest and highest is >= $80
        price_range = filtered_prices[-1] - filtered_prices[0]
        if price_range >= 80:
            return selected_price, True, f"Price range >= $80 (range: ${price_range:.2f})", filtered_prices
        
        return selected_price, False, None, filtered_prices

def find_matching_product(db, pedal_name, condition=None):
    """
    Find best matching product in MongoDB
    Implements the exact logic from index.js lines 196-246
    """
    products_collection = db['products']

    normalized = normalize_pedal_name(pedal_name)
    search_terms = [t for t in normalized.split() if len(t) > 1]

    # Try exact match first
    product = products_collection.find_one({
        'normalizedTitle': normalized,
        'hasPriceGuide': True
    })

    if product:
        return product

    # Try fuzzy match using search terms (all terms must be present)
    if search_terms:
        regex_pattern = ''.join([f'(?=.*{term})' for term in search_terms])
        product = products_collection.find_one(
            {
                'normalizedTitle': {'$regex': regex_pattern, '$options': 'i'},
                'hasPriceGuide': True
            },
            sort=[('priceGuideSummary.all.count', -1)]
        )

        if product:
            return product

    # Try partial match - at least 2 key terms must match
    if len(search_terms) >= 2:
        # Get the most important terms (brand names and model numbers)
        important_terms = [t for t in search_terms if len(t) >= 3]
        if len(important_terms) >= 2:
            partial_pattern = ''.join([f'(?=.*{term})' for term in important_terms[:2]])
            product = products_collection.find_one(
                {
                    'normalizedTitle': {'$regex': partial_pattern, '$options': 'i'},
                    'hasPriceGuide': True
                },
                sort=[('priceGuideSummary.all.count', -1)]
            )

            if product:
                return product

    # Last resort: try matching just the brand if available
    brand_term = next((t for t in search_terms if len(t) >= 4), None)
    if brand_term:
        product = products_collection.find_one(
            {
                'normalizedTitle': {'$regex': brand_term, '$options': 'i'},
                'hasPriceGuide': True
            },
            sort=[('priceGuideSummary.all.count', -1)]
        )

        return product

    return None

def main():
    print("="*80)
    print("PRICING TOOL COMPARISON SCRIPT")
    print("="*80)
    print()

    # Get paths
    script_dir = Path(__file__).parent
    project_root = script_dir.parent

    # Check if cleaned data exists
    input_file = project_root / 'cleaned_pedal_pricing_with_descriptions.xlsx'
    if not input_file.exists():
        print(f"❌ Error: Input file not found at {input_file}")
        print(f"   Please run clean-pedal-pricing.py first to generate the cleaned data")
        sys.exit(1)

    print(f"📂 Reading cleaned data from: {input_file}")
    df = pd.read_excel(input_file)
    print(f"✅ Loaded {len(df)} pedal entries")

    if df.empty:
        print("⚠️  No pedals found in spreadsheet")
        return

    # Connect to MongoDB
    print(f"\n🔌 Connecting to MongoDB: {MONGO_URI}")
    try:
        client = pymongo.MongoClient(MONGO_URI)
        db = client.get_database()
        # Test connection
        db.command('ping')
        print("✅ MongoDB connected successfully")
    except Exception as e:
        print(f"❌ MongoDB connection error: {e}")
        sys.exit(1)

    # Sort by price (ascending) - this will be the "sorted by price" sheet
    df_sorted = df.sort_values('price').reset_index(drop=True)
    print(f"📊 Sorted {len(df_sorted)} pedals by price (ascending)")

    # Process each pedal
    print(f"\n⚙️  Processing {len(df_sorted)} pedals...")
    print()

    results = []
    matched_count = 0
    no_match_count = 0

    # Group by pedal name to calculate "Next Higher Price" (for pedals <= 80)
    # We need to look at ALL pedals to find the next higher price, not just filtered ones
    pedal_groups = df.groupby('pedal_name')['price'].apply(list).to_dict()
    
    # Apply price filtering and selection logic
    print("🔍 Applying price filtering and selection logic...")
    pedal_selections = {}
    manual_review_pedals = set()
    
    for pedal_name, prices in pedal_groups.items():
        selected_price, needs_review, reason, filtered_prices = filter_and_select_price(prices)
        pedal_selections[pedal_name] = {
            'selected_price': selected_price,
            'needs_review': needs_review,
            'reason': reason,
            'all_prices': prices,
            'filtered_prices': filtered_prices
        }
        if needs_review:
            manual_review_pedals.add(pedal_name)
    
    print(f"✅ Processed {len(pedal_selections)} unique pedals")
    print(f"📋 {len(manual_review_pedals)} pedals flagged for manual review")
    print()

    for idx, row in df_sorted.iterrows():
        pedal_name = row['pedal_name']
        condition = row['condition']
        price = row['price']

        # Calculate next higher price (only for pedals <= 80)
        next_higher_price = None
        if price <= 80:
            prices_for_pedal = sorted(pedal_groups.get(pedal_name, [price]))
            for p in prices_for_pedal:
                if p > price:
                    next_higher_price = p
                    break

        # Find matching product in database
        product = find_matching_product(db, pedal_name, condition)

        if product:
            matched_count += 1
            # Calculate price using pricing tool logic
            pt_price, transactions_used = calculate_price_from_transactions(product, condition)
            pt_pedal = product.get('title', 'Unknown')

            # Calculate price difference
            if pt_price:
                price_diff = pt_price - price
            else:
                price_diff = None

            # Print progress every 100 pedals or for first 50 and last 10
            if (idx + 1) % 100 == 0 or (idx + 1) <= 50 or (idx + 1) > len(df_sorted) - 10:
                print(f"✓ [{idx+1}/{len(df_sorted)}] {pedal_name[:40]:40} | Justin: ${price:6.2f} | PT: ${pt_price if pt_price else 0:6.2f} | Diff: ${price_diff if price_diff else 0:+7.2f}")
        else:
            no_match_count += 1
            pt_price = None
            pt_pedal = None
            price_diff = None
            # Print progress every 100 pedals or for first 50 and last 10
            if (idx + 1) % 100 == 0 or (idx + 1) <= 50 or (idx + 1) > len(df_sorted) - 10:
                print(f"✗ [{idx+1}/{len(df_sorted)}] {pedal_name[:40]:40} | Justin: ${price:6.2f} | PT: No Match")
        
        # Progress update every 500 pedals
        if (idx + 1) % 500 == 0:
            print(f"\n📊 Progress: {idx+1}/{len(df_sorted)} ({100*(idx+1)/len(df_sorted):.1f}%) | Matched: {matched_count} | No Match: {no_match_count}\n")

        # Check if this pedal needs manual review
        needs_review = pedal_name in manual_review_pedals
        selection_info = pedal_selections.get(pedal_name, {})
        
        # Only include the selected price in the main results
        # (or all prices if it needs manual review - we'll handle that separately)
        if not needs_review and selection_info.get('selected_price') != price:
            # Skip this entry if it's not the selected price
            continue
        
        results.append({
            'Pedal Name': pedal_name,
            'Price': price,
            'Next Higher Price': next_higher_price,
            'PT Price': pt_price,
            'PT Pedal': pt_pedal,
            'Price Difference': price_diff,
            'Condition': condition,
            'Date': row['date'],
            'Original Text': row['original_description'],
            'Needs Manual Review': 'Yes' if needs_review else 'No',
            'Review Reason': selection_info.get('reason', '')
        })

    # Create results DataFrame
    results_df = pd.DataFrame(results)

    # Summary statistics
    print()
    print("="*80)
    print("SUMMARY")
    print("="*80)
    print(f"Total pedal entries in spreadsheet: {len(df_sorted)}")
    print(f"Unique pedals after price selection: {len(results_df)}")
    print(f"Matched in database: {matched_count} ({matched_count/len(results_df)*100:.1f}%)")
    print(f"Not matched: {no_match_count} ({no_match_count/len(results_df)*100:.1f}%)")
    print(f"Pedals flagged for manual review: {len(manual_review_pedals)}")

    # Calculate statistics for matched pedals with price differences
    matched_with_price = results_df[results_df['PT Price'].notna()]
    if not matched_with_price.empty:
        print(f"\nPrice Difference Statistics (for {len(matched_with_price)} matched pedals):")
        print(f"  Mean difference: ${matched_with_price['Price Difference'].mean():+.2f}")
        print(f"  Median difference: ${matched_with_price['Price Difference'].median():+.2f}")
        print(f"  Min difference: ${matched_with_price['Price Difference'].min():+.2f}")
        print(f"  Max difference: ${matched_with_price['Price Difference'].max():+.2f}")

        # Show distribution
        higher_count = (matched_with_price['Price Difference'] > 0).sum()
        lower_count = (matched_with_price['Price Difference'] < 0).sum()
        equal_count = (matched_with_price['Price Difference'] == 0).sum()
        print(f"\nPrice Tool vs Justin's Prices:")
        print(f"  PT Higher: {higher_count} ({higher_count/len(matched_with_price)*100:.1f}%)")
        print(f"  PT Lower: {lower_count} ({lower_count/len(matched_with_price)*100:.1f}%)")
        print(f"  Equal: {equal_count} ({equal_count/len(matched_with_price)*100:.1f}%)")

    # Save results to Excel with multiple sheets - matching client_review_package format
    output_file = project_root / 'pricing_comparison.xlsx'
    print(f"\n💾 Saving results to: {output_file}")

    with pd.ExcelWriter(output_file, engine='openpyxl') as writer:
        # 1. Instructions sheet
        instructions_data = {
            'HOW TO USE THIS WORKBOOK FOR PRICING TOOL VALIDATION': [
                None,
                "1. Go to the 'Sorted by Price' tab",
                None,
                "2. For pedals with price <= $80, the 'Next Higher Price' column shows the next price up",
                "   This helps you quickly see if there are big gaps that might indicate errors",
                None,
                "3. TO VALIDATE: Enter each pedal into your Pricing Tool and record:",
                "   - Column D 'PT Price': The price the Pricing Tool returns",
                "   - Column E 'PT Pedal': The pedal name the Pricing Tool used (if different)",
                None,
                "4. The 'Price Difference' column will automatically calculate:",
                "   Price Difference = PT Price - Spreadsheet Price",
                "   - Positive number = Pricing Tool price is HIGHER",
                "   - Negative number = Pricing Tool price is LOWER",
                "   - Large differences may indicate extraction errors",
                None,
                "5. Look for patterns:",
                "   - Consistent small differences = good!",
                "   - Large differences (>$20) = investigate the original data",
                "   - PT Pedal differs = may indicate pedal name extraction issue",
                None,
                "6. Focus on pedals <= $80 first since those have 'Next Higher Price' populated",
                None,
                "7. If you find errors, note them and we can improve the extraction logic",
                None,
                "THE BEAUTY: Side-by-side comparison makes validation fast and systematic!"
            ]
        }
        instructions_df = pd.DataFrame(instructions_data)
        instructions_df.to_excel(writer, sheet_name='Instructions for PT Comparison', index=False)
        
        # 2. Comparison View - basic view with all pedals
        comparison_view = results_df[['Pedal Name', 'Price', 'Condition', 'Date', 'Original Text']].copy()
        comparison_view.to_excel(writer, sheet_name='Comparison View', index=False)
        
        # 3. Duplicates by Name
        duplicates_data = []
        pedal_counts = df.groupby('pedal_name').size()
        duplicates = pedal_counts[pedal_counts > 1]
        for pedal_name in duplicates.index:
            pedal_entries = df[df['pedal_name'] == pedal_name].copy()
            for _, row in pedal_entries.iterrows():
                duplicates_data.append({
                    'Pedal Name': pedal_name,
                    'Price': row['price'],
                    'Condition': row.get('condition'),
                    'Date': row.get('date'),
                    'Original Text': row.get('original_description', ''),
                    'Duplicate Count': len(pedal_entries)
                })
        if duplicates_data:
            duplicates_df = pd.DataFrame(duplicates_data)
            duplicates_df = duplicates_df.sort_values(['Pedal Name', 'Price'])
            duplicates_df.to_excel(writer, sheet_name='Duplicates by Name', index=False)
        
        # 4. Sorted by Price - main comparison sheet
        # Reorder columns to match format: Pedal Name, Price, Next Higher Price, PT Price, PT Pedal, Price Difference, Condition, Date, Original Text
        column_order = ['Pedal Name', 'Price', 'Next Higher Price', 'PT Price', 'PT Pedal', 'Price Difference', 'Condition', 'Date', 'Original Text']
        available_columns = [col for col in column_order if col in results_df.columns]
        remaining_columns = [col for col in results_df.columns if col not in available_columns]
        final_column_order = available_columns + remaining_columns
        results_df_ordered = results_df[final_column_order].copy()
        results_df_ordered.to_excel(writer, sheet_name='Sorted by Price', index=False)

        # 5. Manual Review tab - include ALL entries for pedals that need review
        manual_review_data = []
        for pedal_name in manual_review_pedals:
            # Get all original entries for this pedal
            pedal_entries = df[df['pedal_name'] == pedal_name].copy()
            selection_info = pedal_selections[pedal_name]
            
            for _, entry_row in pedal_entries.iterrows():
                manual_review_data.append({
                    'Pedal Name': pedal_name,
                    'Price': entry_row['price'],
                    'Condition': entry_row.get('condition'),
                    'Date': entry_row.get('date'),
                    'Original Text': entry_row.get('original_description', ''),
                    'Review Reason': selection_info.get('reason', '')
                })
        
        if manual_review_data:
            manual_review_df = pd.DataFrame(manual_review_data)
            manual_review_df = manual_review_df.sort_values(['Pedal Name', 'Price'])
            manual_review_df.to_excel(writer, sheet_name='Manual Review', index=False)

    print("✅ Results saved successfully!")
    print()
    print("📋 Sheets created (matching client_review_package format):")
    print("   1. Instructions for PT Comparison - How to use this workbook")
    print("   2. Comparison View - Basic view with all pedals")
    print("   3. Duplicates by Name - Pedals with multiple entries")
    print("   4. Sorted by Price - Main comparison with PT prices (with selected prices)")
    print("   5. Manual Review - Pedals that need manual review (all prices included)")

    client.close()
    print("\n✅ Done!")

if __name__ == "__main__":
    main()
