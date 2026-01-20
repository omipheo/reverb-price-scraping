import pymongo
import re
import sys

def normalize_pedal_name(name):
    if not name:
        return ''
    name = name.lower()
    name = re.sub(r'\b(excellent|very good|good|fair|poor|mint|b-stock|demo)\b', ' ', name, flags=re.IGNORECASE)
    name = re.sub(r'\bcondition\b', ' ', name, flags=re.IGNORECASE)
    name = re.sub(r'\b(19|20)\d{2}\b', ' ', name)
    name = re.sub(r'\([^)]*\)', ' ', name)
    name = re.sub(r'\[[^\]]*\]', ' ', name)
    name = re.sub(r'[^a-z0-9]+', ' ', name)
    name = re.sub(r'\s+', ' ', name)
    return name.strip()

client = pymongo.MongoClient('mongodb://127.0.0.1:27017/pedal_prices_v2')
db = client.get_database()

pedals_to_test = [
    'BOSS PH-3',
    'BOSS BD-2',
    '$ 20 less per pedal',
    '11-Boss GE-7'
]

for pedal_name in pedals_to_test:
    print(f'\n=== Testing: {pedal_name} ===')
    normalized = normalize_pedal_name(pedal_name)
    search_terms = [t for t in normalized.split() if len(t) > 1]

    print(f'Normalized: "{normalized}"')
    print(f'Search terms: {search_terms}')

    # Try exact match
    product = db['products'].find_one({
        'normalizedTitle': normalized,
        'hasPriceGuide': True
    })

    if product:
        print(f'-> Exact match: {product["title"]} ({len(product.get("priceGuide", []))} transactions)')
    else:
        print('-> No exact match')
        # Try fuzzy
        if search_terms:
            regex_pattern = ''.join([f'(?=.*{term})' for term in search_terms])
            product = db['products'].find_one(
                {
                    'normalizedTitle': {'$regex': regex_pattern, '$options': 'i'},
                    'hasPriceGuide': True
                },
                sort=[('priceGuideSummary.all.count', -1)]
            )
            if product:
                print(f'-> Fuzzy match: {product["title"]} ({len(product.get("priceGuide", []))} transactions)')
            else:
                print('-> No match found')
        else:
            print('-> No search terms')

client.close()
