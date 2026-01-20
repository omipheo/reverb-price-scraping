import pymongo
import re

MONGO_URI = "mongodb://127.0.0.1:27017/pedal_prices_v2"

def normalize_condition(condition):
    if not condition or not isinstance(condition, str):
        return None
    return ' '.join(word.capitalize() for word in condition.lower().split())

# Connect
client = pymongo.MongoClient(MONGO_URI)
db = client['pedal_prices_v2']

# Find Boss PH-3
product = db['products'].find_one({
    'normalizedTitle': {'$regex': 'boss.*ph.*3', '$options': 'i'},
    'hasPriceGuide': True
})

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

# Find non-Mint
non_mint = []
for tx in sorted_transactions:
    tx_condition = normalize_condition(tx.get('condition'))
    if tx_condition != "Mint":
        non_mint.append(tx)
        if len(non_mint) >= 14:
            break

print(f"\nFound {len(non_mint)} non-Mint transactions:")
for i, tx in enumerate(non_mint[:14], 1):
    print(f"  {i}. {tx.get('condition')}: ${tx.get('amount')}")

# Calculate with middle 6 logic
if len(non_mint) >= 14:
    middle = non_mint[4:10]
    print(f"\nUsing middle 6 (indices 4-9):")
    for i, tx in enumerate(middle, 1):
        print(f"  {i}. {tx.get('condition')}: ${tx.get('amount')}")

    amounts = [tx['amount'] for tx in middle if isinstance(tx.get('amount'), (int, float))]
    if amounts:
        avg = sum(amounts) / len(amounts)
        adjusted = avg * 0.90
        print(f"\nAverage: ${avg:.2f}")
        print(f"Adjusted (10% discount): ${adjusted:.2f}")
else:
    print(f"\nNot enough transactions (need 14, have {len(non_mint)})")

client.close()
