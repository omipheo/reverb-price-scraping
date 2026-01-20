import pymongo
import re

MONGO_URI = "mongodb://127.0.0.1:27017/pedal_prices_v2"

def normalize_condition(condition):
    """Normalize condition string for matching"""
    if not condition or not isinstance(condition, str):
        return None
    # Convert to title case
    return ' '.join(word.capitalize() for word in condition.lower().split())

def normalize_pedal_name(name):
    """Normalize pedal name for matching"""
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

def calculate_price_from_transactions(product, condition=None):
    """Calculate price from product transactions"""
    if not product or 'priceGuide' not in product or not product['priceGuide']:
        print(f"  No product or priceGuide")
        return None

    print(f"  Product has {len(product['priceGuide'])} transactions")

    # Sort transactions by createdAt (most recent first)
    sorted_transactions = sorted(
        product['priceGuide'],
        key=lambda x: x.get('createdAt', 0),
        reverse=True
    )

    relevant_transactions = []

    if condition and condition != "Unknown":
        normalized_condition = normalize_condition(condition)
        print(f"  Looking for condition: {normalized_condition}")

        for tx in sorted_transactions:
            tx_condition = normalize_condition(tx.get('condition'))
            if tx_condition == normalized_condition:
                relevant_transactions.append(tx)
                if len(relevant_transactions) >= 6:
                    break

        print(f"  Found {len(relevant_transactions)} transactions with matching condition")

        if len(relevant_transactions) >= 6:
            relevant_transactions = relevant_transactions[2:4]
        elif len(relevant_transactions) >= 4:
            start = (len(relevant_transactions) - 2) // 2
            relevant_transactions = relevant_transactions[start:start + 2]
    else:
        print(f"  Looking for non-Mint transactions (no specific condition)")

        for tx in sorted_transactions:
            tx_condition = normalize_condition(tx.get('condition'))
            if tx_condition != "Mint":
                relevant_transactions.append(tx)
                if len(relevant_transactions) >= 14:
                    break

        print(f"  Found {len(relevant_transactions)} non-Mint transactions")

        if len(relevant_transactions) >= 14:
            relevant_transactions = relevant_transactions[4:10]
        elif len(relevant_transactions) >= 10:
            start = (len(relevant_transactions) - 6) // 2
            relevant_transactions = relevant_transactions[start:start + 6]
        elif len(relevant_transactions) >= 6:
            start = (len(relevant_transactions) - 2) // 2
            relevant_transactions = relevant_transactions[start:start + 2]

    print(f"  Using {len(relevant_transactions)} transactions for calculation")

    if not relevant_transactions:
        return None

    amounts = [tx['amount'] for tx in relevant_transactions if isinstance(tx.get('amount'), (int, float))]

    if not amounts:
        return None

    print(f"  Amounts: {amounts}")

    average = sum(amounts) / len(amounts)
    print(f"  Average: ${average:.2f}")

    if average >= 200:
        adjusted_price = average * 0.95
        print(f"  Applied 5% discount (pedal >= $200)")
    else:
        adjusted_price = average * 0.90
        print(f"  Applied 10% discount (pedal < $200)")

    print(f"  Final price: ${adjusted_price:.2f}")

    return round(adjusted_price, 2)

# Connect to MongoDB
client = pymongo.MongoClient(MONGO_URI)
db = client.get_database()

# Test with Boss BD-2
print("Testing Boss BD-2:")
pedal_name = "BOSS BD-2"
normalized = normalize_pedal_name(pedal_name)
print(f"Normalized name: '{normalized}'")

product = db['products'].find_one({
    'normalizedTitle': {'$regex': 'boss.*bd.*2', '$options': 'i'},
    'hasPriceGuide': True
})

if product:
    print(f"Found product: {product['title']}")
    price = calculate_price_from_transactions(product, None)
    print(f"\nCalculated price: ${price if price else 0:.2f}")
else:
    print("No product found")

client.close()
