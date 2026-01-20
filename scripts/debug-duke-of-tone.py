#!/usr/bin/env python3
import pymongo

MONGO_URI = "mongodb://127.0.0.1:27017/pedal_prices_v2"

def normalize_condition(condition):
    if not condition or not isinstance(condition, str):
        return None
    return ' '.join(word.capitalize() for word in condition.lower().split())

client = pymongo.MongoClient(MONGO_URI)
db = client['pedal_prices_v2']

product = db['products'].find_one({'title': {'$regex': 'Duke of Tone', '$options': 'i'}, 'hasPriceGuide': True})

if not product:
    print("Product not found")
    exit(1)

print(f"Product: {product['title']}")
print(f"Total transactions: {len(product['priceGuide'])}")

# Sort by createdAt
sorted_transactions = sorted(
    product['priceGuide'],
    key=lambda x: x.get('createdAt', 0),
    reverse=True
)

print("\nFirst 20 sorted transactions:")
for i, tx in enumerate(sorted_transactions[:20], 1):
    cond = tx.get('condition')
    norm_cond = normalize_condition(cond)
    is_mint = norm_cond == 'Mint'
    print(f"  {i}. {cond:15} -> {str(norm_cond):15} | ${tx.get('amount'):6.2f} | Mint:{is_mint}")

# Count non-Mint
non_mint = []
for tx in sorted_transactions:
    tx_condition = normalize_condition(tx.get('condition'))
    if tx_condition != "Mint":
        non_mint.append(tx)
        if len(non_mint) >= 14:
            break

print(f"\nFound {len(non_mint)} non-Mint transactions (need 14)")
print("\nFirst 14 non-Mint:")
for i, tx in enumerate(non_mint[:14], 1):
    print(f"  {i}. {tx.get('condition'):15} | ${tx.get('amount'):6.2f}")

if len(non_mint) >= 14:
    middle_6 = non_mint[4:10]
    amounts = [tx['amount'] for tx in middle_6 if isinstance(tx.get('amount'), (int, float))]
    if amounts:
        avg = sum(amounts) / len(amounts)
        adjusted = avg * 0.90
        print(f"\nUsing middle 6 (indices 4-9):")
        for tx in middle_6:
            print(f"  {tx.get('condition'):15} | ${tx.get('amount'):6.2f}")
        print(f"\nAverage: ${avg:.2f}")
        print(f"Adjusted (10% discount): ${adjusted:.2f}")

client.close()
