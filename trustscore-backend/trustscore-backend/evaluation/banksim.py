"""
BankSim filtering, category sensitivity and demonstration data checks.
"""
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import ast
import csv
import random
import statistics
from collections import Counter, defaultdict
from functools import lru_cache

from trust_score.trust_score_engine import TrustScoreEngine

DATA = ROOT / 'data' / 'banksim' / 'bs140513_032310.csv'


def importer_mapping():
    """Read the importer's literal category map without connecting to Supabase."""
    source = (ROOT / 'data' / 'banksim_import.py').read_text(encoding='utf-8')
    for node in ast.parse(source).body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'CATEGORY_MAPPING' for t in node.targets):
            return ast.literal_eval(node.value)
    raise RuntimeError('CATEGORY_MAPPING not found in data/banksim_import.py')


@lru_cache(maxsize=1)
def rows():
    if not DATA.is_file():
        raise FileNotFoundError(f'Missing BankSim dataset: {DATA}')
    mapped = importer_mapping()
    result = []
    with DATA.open(encoding='utf-8', newline='') as file:
        reader = csv.DictReader(file)
        for row in reader:
            age = str(row.get('age') or '').strip().strip('\"\'')
            fraud = str(row.get('fraud') or '').strip().strip('\"\'')
            raw_cat = str(row.get('category') or '').strip().strip('\"\'')
            if age != '1' or fraud != '0' or raw_cat not in mapped:
                continue
            try:
                amount = float(str(row['amount']).strip().strip('\"\''))
            except (ValueError, TypeError):
                continue
            customer = str(row.get('customer') or '').strip().strip('\"\'')
            result.append({'customer': customer, 'category': mapped[raw_cat], 'amount': amount})
    return result


def adjusted_percent(items, multipliers):
    actual = sum(row['amount'] for row in items)
    adjusted = sum(row['amount'] * multipliers.get(row['category'], 1) for row in items)
    return (adjusted - actual) / actual * 100 if actual else 0


def balanced_median(items, sample_size=100, repetitions=100, seed=42):
    grouped = defaultdict(list)
    for item in items:
        grouped[item['category']].append(item)
    categories = ['Food & Drinks', 'Transport', 'Shopping', 'Entertainment', 'Fitness', 'Other']
    values = []
    for repetition in range(repetitions):
        rng = random.Random(seed + repetition)
        sample = []
        for category in categories:
            sample.extend(rng.sample(grouped[category], sample_size))
        values.append(adjusted_percent(sample, TrustScoreEngine.CATEGORY_MULTIPLIERS))
    return statistics.median(values)


def sensitivity_results():
    items = rows()
    base = TrustScoreEngine.CATEGORY_MULTIPLIERS
    mild = {**base, 'Transport': 0.95, 'Shopping': 1.025, 'Entertainment': 1.05, 'Gaming': 1.05}
    strong = {**base, 'Transport': 0.80, 'Shopping': 1.10, 'Entertainment': 1.20, 'Gaming': 1.20}
    counts = Counter(row['category'] for row in items)
    spend = defaultdict(float)
    for item in items:
        spend[item['category']] += item['amount']
    actual = sum(item['amount'] for item in items)
    adjusted = sum(item['amount'] * base.get(item['category'], 1) for item in items)
    selected = [item for item in items if item['customer'] == 'C1268275182'] #Selected customer for demonstration purposes
    return {
        'filtered_transactions': len(items),
        'customers': len(set(item['customer'] for item in items)),
        'category_counts': dict(counts),
        'category_spending_percent': {k: round(v/actual*100, 1) for k,v in spend.items()},
        'actual_total': round(actual, 2),
        'adjusted_total': round(adjusted, 2),
        'mild_percent': round(adjusted_percent(items, mild), 2),
        'baseline_percent': round(adjusted_percent(items, base), 2),
        'strong_percent': round(adjusted_percent(items, strong), 2),
        'balanced_percent': round(balanced_median(items), 2),
        'selected_customer_count': len(selected),
    }


if __name__ == '__main__':
    import json
    result = sensitivity_results()
    assert result['filtered_transactions'] == 57442 and result['customers'] == 403
    assert result['selected_customer_count'] == 176
    output = ROOT / 'evaluation' / 'results'
    output.mkdir(parents=True, exist_ok=True)
    (output / 'banksim_results.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    print('Transactions:', result['filtered_transactions'], 'Customers:', result['customers'])
    print('Baseline adjustment: %.2f%%' % result['baseline_percent'])
    print('Balanced median: %.2f%%' % result['balanced_percent'])
    print('Selected customer records:', result['selected_customer_count'])
    print('Saved:', output / 'banksim_results.json')
