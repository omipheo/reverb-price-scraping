#!/usr/bin/env python3
# Note: Use 'python3' command, not 'python' (which points to Python 3.12)
"""
Script to help manually verify cleaned pedal pricing data
Compares cleaned data with original spreadsheet and highlights potential issues
"""

import pandas as pd
import openpyxl
from pathlib import Path
import sys

def verify_cleaned_data():
    """Verify cleaned data against original spreadsheet"""
    
    script_dir = Path(__file__).parent
    project_root = script_dir.parent
    
    # File paths
    original_file = project_root / 'justin pricing spreadsheet.xlsx'
    cleaned_file = project_root / 'cleaned_pedal_pricing_with_descriptions.xlsx'
    
    if not original_file.exists():
        print(f"❌ Original file not found: {original_file}")
        return
    
    if not cleaned_file.exists():
        print(f"❌ Cleaned file not found: {cleaned_file}")
        print("   Please run clean-pedal-pricing.py first")
        return
    
    print("="*80)
    print("CLEANED DATA VERIFICATION TOOL")
    print("="*80)
    print()
    
    # Load cleaned data
    print(f"📂 Loading cleaned data from: {cleaned_file}")
    cleaned_df = pd.read_excel(cleaned_file)
    print(f"✅ Loaded {len(cleaned_df)} cleaned entries")
    print()
    
    # Load original spreadsheet
    print(f"📂 Loading original spreadsheet: {original_file}")
    wb = openpyxl.load_workbook(original_file, data_only=True)
    ws = wb['Sheet1']
    print(f"✅ Original spreadsheet has {ws.max_row} rows")
    print()
    
    # Statistics
    print("="*80)
    print("CLEANED DATA STATISTICS")
    print("="*80)
    print(f"Total entries: {len(cleaned_df)}")
    print(f"Unique pedal names: {cleaned_df['pedal_name'].nunique()}")
    print(f"Price range: ${cleaned_df['price'].min():.2f} - ${cleaned_df['price'].max():.2f}")
    print(f"Average price: ${cleaned_df['price'].mean():.2f}")
    print(f"Median price: ${cleaned_df['price'].median():.2f}")
    print()
    
    # Condition breakdown
    print("Condition breakdown:")
    condition_counts = cleaned_df['condition'].value_counts(dropna=False)
    for condition, count in condition_counts.items():
        print(f"  {condition or 'None'}: {count}")
    print()
    
    # Check for potential issues
    print("="*80)
    print("POTENTIAL ISSUES TO REVIEW")
    print("="*80)
    print()
    
    # 1. Very low prices (might be errors)
    print("1. VERY LOW PRICES (≤ $10) - Review for accuracy:")
    print("-" * 80)
    low_prices = cleaned_df[cleaned_df['price'] <= 10].sort_values('price')
    if not low_prices.empty:
        for idx, row in low_prices.head(20).iterrows():
            print(f"   ${row['price']:6.2f} | {row['pedal_name'][:50]:50} | {row.get('original_description', '')[:40]}")
        if len(low_prices) > 20:
            print(f"   ... and {len(low_prices) - 20} more")
    else:
        print("   None found")
    print()
    
    # 2. Very high prices (might be errors)
    print("2. VERY HIGH PRICES (≥ $500) - Review for accuracy:")
    print("-" * 80)
    high_prices = cleaned_df[cleaned_df['price'] >= 500].sort_values('price', ascending=False)
    if not high_prices.empty:
        for idx, row in high_prices.head(20).iterrows():
            print(f"   ${row['price']:6.2f} | {row['pedal_name'][:50]:50} | {row.get('original_description', '')[:40]}")
        if len(high_prices) > 20:
            print(f"   ... and {len(high_prices) - 20} more")
    else:
        print("   None found")
    print()
    
    # 3. Pedals with no condition extracted
    print("3. PEDALS WITH NO CONDITION EXTRACTED:")
    print("-" * 80)
    no_condition = cleaned_df[cleaned_df['condition'].isna()].head(20)
    if not no_condition.empty:
        for idx, row in no_condition.iterrows():
            orig = row.get('original_description', '')
            print(f"   {row['pedal_name'][:50]:50} | Original: {orig[:50]}")
        if len(cleaned_df[cleaned_df['condition'].isna()]) > 20:
            print(f"   ... and {len(cleaned_df[cleaned_df['condition'].isna()]) - 20} more")
    else:
        print("   All pedals have condition extracted")
    print()
    
    # 4. Pedals with unusual names (might be parsing errors)
    print("4. PEDALS WITH SHORT/UNUSUAL NAMES (might be parsing errors):")
    print("-" * 80)
    short_names = cleaned_df[cleaned_df['pedal_name'].str.len() < 5].head(20)
    if not short_names.empty:
        for idx, row in short_names.iterrows():
            print(f"   '{row['pedal_name']}' | Original: {row.get('original_description', '')[:60]}")
    else:
        print("   None found")
    print()
    
    # 5. Duplicate pedal names with very different prices
    print("5. DUPLICATE PEDAL NAMES WITH LARGE PRICE DIFFERENCES:")
    print("-" * 80)
    pedal_groups = cleaned_df.groupby('pedal_name')['price']
    duplicates = []
    for name, group in pedal_groups:
        if len(group) > 1:
            price_range = group.max() - group.min()
            if price_range > 50:  # More than $50 difference
                duplicates.append({
                    'name': name,
                    'count': len(group),
                    'min_price': group.min(),
                    'max_price': group.max(),
                    'range': price_range
                })
    
    if duplicates:
        duplicates_sorted = sorted(duplicates, key=lambda x: x['range'], reverse=True)
        for dup in duplicates_sorted[:20]:
            print(f"   {dup['name'][:50]:50} | {dup['count']} entries | ${dup['min_price']:.2f} - ${dup['max_price']:.2f} (range: ${dup['range']:.2f})")
        if len(duplicates) > 20:
            print(f"   ... and {len(duplicates) - 20} more")
    else:
        print("   None found")
    print()
    
    # 6. Sample entries for manual review
    print("="*80)
    print("SAMPLE ENTRIES FOR MANUAL REVIEW")
    print("="*80)
    print()
    print("First 10 entries (check if pedal names and prices look correct):")
    print("-" * 80)
    for idx, row in cleaned_df.head(10).iterrows():
        orig = row.get('original_description', 'N/A')
        cond = row.get('condition', 'None')
        print(f"   Pedal: {row['pedal_name'][:50]:50}")
        print(f"   Price: ${row['price']:6.2f} | Condition: {cond}")
        print(f"   Original: {orig[:70]}")
        print()
    
    print("Last 10 entries:")
    print("-" * 80)
    for idx, row in cleaned_df.tail(10).iterrows():
        orig = row.get('original_description', 'N/A')
        cond = row.get('condition', 'None')
        print(f"   Pedal: {row['pedal_name'][:50]:50}")
        print(f"   Price: ${row['price']:6.2f} | Condition: {cond}")
        print(f"   Original: {orig[:70]}")
        print()
    
    # Instructions for manual verification
    print("="*80)
    print("HOW TO MANUALLY VERIFY")
    print("="*80)
    print()
    print("1. Open the original spreadsheet: 'justin pricing spreadsheet.xlsx'")
    print("2. Open the cleaned data: 'cleaned_pedal_pricing_with_descriptions.xlsx'")
    print("3. Compare side-by-side:")
    print("   - Check if all pedals from original are in cleaned data")
    print("   - Verify pedal names are correctly extracted")
    print("   - Verify prices match the original")
    print("   - Check if conditions were correctly identified")
    print()
    print("4. Focus on reviewing:")
    print("   - Very low prices (≤ $10) - might be errors")
    print("   - Very high prices (≥ $500) - might be errors")
    print("   - Duplicate pedal names with large price differences")
    print("   - Pedals with no condition extracted")
    print()
    print("5. Search for specific pedals:")
    print("   - Use Excel's Find function to search for pedal names")
    print("   - Compare the 'original_description' column with original spreadsheet")
    print()
    print("6. Check the duplicate_analysis.xlsx file for pedals with multiple entries")
    print()
    
    wb.close()
    print("✅ Verification complete!")
    print()
    print("💡 Tip: Use Excel to open both files side-by-side for easier comparison")

if __name__ == "__main__":
    verify_cleaned_data()
