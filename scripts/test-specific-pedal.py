import pymongo
import re

MONGO_URI = "mongodb://127.0.0.1:27017/pedal_prices_v2"

def normalize_pedal_name(name):
    """Normalize pedal name for matching"""
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

def find_matching_product(db, pedal_name):
    """Find matching product"""
    products_collection = db['products']

    normalized = normalize_pedal_name(pedal_name)
    search_terms = [t for t in normalized.split() if len(t) > 1]

    print(f"  Normalized: '{normalized}'")
    print(f"  Search terms: {search_terms}")

    # Try exact match first
    product = products_collection.find_one({
        'normalizedTitle': normalized,
        'hasPriceGuide': True
    })

    if product:
        print(f"  -> Found exact match: {product['title']}")
        return product

    # Try fuzzy match
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

# Test with Boss PH-3
client = pymongo.MongoClient(MONGO_URI)
db = client['pedal_prices_v2']

pedal = "BOSS PH-3"
print(f"Testing: {pedal}")
print(f"Normalized: {normalize_pedal_name(pedal)}")

product = find_matching_product(db, pedal_name, None)

if product:
    print(f"Matched to: {product['title']}")
    print(f"Has {len(product.get('priceGuide', []))} transactions")

    # Check conditions available
    conditions = {}
    for tx in product['priceGuide']:
        cond = normalize_condition(tx.get('condition'))
        amounts[cond] = amounts.get(cond, []) + [tx.get('amount')]

    print("Conditions available:")
    for cond, amts in amounts.items():
        print(f"  {cond}: {len(amts)} transactions")

    price = calculate_price_from_transactions(product, None)
    print(f"\nCalculated price (no condition): ${price if price else 0:.2f}")
else:
    print("No product found")
