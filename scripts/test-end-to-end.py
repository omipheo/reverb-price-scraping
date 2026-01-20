#!/usr/bin/env python3
import pandas as pd
import pymongo
import re

MONGO_URI = "mongodb://127.0.0.1:27017/pedal_prices_v2"

def normalize_pedal_name(name):
    if not name:
        return ""
    name = name.lower()
    name = re.sub(r'\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b', ' ', name, flags=re.IGNORECASE)
    name = re.sub(r'\bcondition\b', ' ', name, flags=re.IGNORECASE)
    name = re.sub(r'\b(19|20)\d{2}\b', ' ', name)
    name = re.sub(r'\([^)]*\)', ' ', name)
    name = re.sub(r'\[[^\]]*\]', ' ', name)
    name = re.sub(r'[^a-z0-9]+', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()

def normalize_condition(condition):
    if not condition or not isinstance(condition, str):
        return None
    return ' '.join(word.capitalize() for word in condition.lower().split())

def calculate_price_from_transactions(product, condition=None):
    if not product or 'priceGuide' not in product or not product['priceGuide']:
        return None, []

    sorted_transactions = sorted(
        product['priceGuide'],
        key=lambda x: x.get('createdAt', 0),
        reverse=True
    )

    relevant_transactions = []

    # Check if condition is a valid string (not None, not NaN, not empty)
    has_condition = isinstance(condition, str) and condition and condition != "Unknown"

    if has_condition:
        normalized_condition = normalize_condition(condition)
        for tx in sorted_transactions:
            tx_condition = normalize_condition(tx.get('condition'))
            if tx_condition == normalized_condition:
                relevant_transactions.append(tx)
                if len(relevant_transactions) >= 6:
                    break

        if len(relevant_transactions) >= 6:
            relevant_transactions = relevant_transactions[2:4]
        elif len(relevant_transactions) >= 4:
            start = (len(relevant_transactions) - 2) // 2
            relevant_transactions = relevant_transactions[start:start + 2]
    else:
        for tx in sorted_transactions:
            tx_condition = normalize_condition(tx.get('condition'))
            if tx_condition != "Mint":
                relevant_transactions.append(tx)
                if len(relevant_transactions) >= 14:
                    break

        if len(relevant_transactions) >= 14:
            relevant_transactions = relevant_transactions[4:10]
        elif len(relevant_transactions) >= 10:
            start = (len(relevant_transactions) - 6) // 2
            relevant_transactions = relevant_transactions[start:start + 6]
        elif len(relevant_transactions) >= 6:
            start = (len(relevant_transactions) - 2) // 2
            relevant_transactions = relevant_transactions[start:start + 2]

    if not relevant_transactions:
        return None, []

    amounts = [tx['amount'] for tx in relevant_transactions if isinstance(tx.get('amount'), (int, float))]

    if not amounts:
        return None, relevant_transactions

    average = sum(amounts) / len(amounts)

    if average >= 200:
        adjusted_price = average * 0.95
    else:
        adjusted_price = average * 0.90

    return round(adjusted_price, 2), relevant_transactions

def find_matching_product(db, pedal_name):
    products_collection = db['products']
    normalized = normalize_pedal_name(pedal_name)
    search_terms = [t for t in normalized.split() if len(t) > 1]

    # Try exact match
    product = products_collection.find_one({
        'normalizedTitle': normalized,
        'hasPriceGuide': True
    })

    if product:
        return product

    # Try fuzzy
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

    return None

# Test with actual data from the spreadsheet
client = pymongo.MongoClient(MONGO_URI)
db = client.get_database()

# Load data
df = pd.read_excel('cleaned_pedal_pricing_with_descriptions.xlsx')
df_filtered = df[df['price'] <= 80].copy()
df_filtered = df_filtered.sort_values('pedal_name').reset_index(drop=True)

# Test first 5 pedals
for idx, row in df_filtered.head(10).iterrows():
    pedal_name = row['pedal_name']
    condition = row['condition']
    price = row['price']

    print(f"\n=== Pedal #{idx+1}: {pedal_name} ===")
    print(f"Justin's Price: ${price}")
    print(f"Condition: {condition}")

    product = find_matching_product(db, pedal_name)

    if product:
        print(f"Matched to: {product['title']}")
        print(f"Transactions: {len(product['priceGuide'])}")

        pt_price, transactions_used = calculate_price_from_transactions(product, condition)

        if pt_price:
            print(f"PT Price: ${pt_price}")
            print(f"Difference: ${pt_price - price:+.2f}")
        else:
            print(f"PT Price: None (calculation returned no price)")
            print(f"Transactions used in calculation: {len(transactions_used)}")
    else:
        print("No match found in database")

client.close()
