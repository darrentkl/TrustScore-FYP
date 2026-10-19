"""
Selection criteria 
1. At least one transaction in each of the six mapped spending categories.
2. Transaction count between 75% and 125% of the median for all filtered
   customers 
3. Select the highest proportion of non-Transport transactions among eligible customers.
   Tie break using alphabetical customer-ID 
"""

import ast
import csv
import statistics
from collections import Counter, defaultdict
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent
SOURCE_CSV = DATA_DIR / "banksim" / "bs140513_032310.csv"
IMPORTER_PY = DATA_DIR / "banksim_import.py"
RESULT_CSV = DATA_DIR / "banksim_customer_selection.csv"


def importer_constants():
    """Read literal importer settings without importing Supabase/database modules."""
    tree = ast.parse(IMPORTER_PY.read_text(encoding="utf-8"), filename=str(IMPORTER_PY))
    values = {}
    for statement in tree.body:
        if not isinstance(statement, (ast.Assign, ast.AnnAssign)):
            continue
        targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
        for target in targets:
            if isinstance(target, ast.Name) and target.id in {"CATEGORY_MAPPING", "SELECTED_CUSTOMER_ID"}:
                values[target.id] = ast.literal_eval(statement.value)
    missing = {"CATEGORY_MAPPING", "SELECTED_CUSTOMER_ID"} - values.keys()
    if missing:
        raise RuntimeError(f"Missing importer settings: {', '.join(sorted(missing))}")
    return values["CATEGORY_MAPPING"], values["SELECTED_CUSTOMER_ID"]


def clean(value):
    return str(value or "").strip().strip("\"'")


def filtered_counts(category_map):
    """Group valid, age-group-1, non-fraud transactions by customer/category."""
    by_customer = defaultdict(Counter)
    total = 0
    with SOURCE_CSV.open("r", newline="", encoding="utf-8") as file:
        for record in csv.DictReader(file):
            if clean(record.get("age")) != "1" or clean(record.get("fraud")) != "0":
                continue
            category = category_map.get(clean(record.get("category")))
            if category is None:
                continue
            try:
                float(clean(record.get("amount")))
            except (ValueError, TypeError):
                continue
            customer = clean(record.get("customer"))
            by_customer[customer][category] += 1
            total += 1
    if not by_customer:
        raise ValueError("No valid BankSim transactions after filtering")
    return by_customer, total


def select_customer(by_customer, categories):
    """Apply all three criteria; do not use any predetermined customer ID."""
    counts = [sum(category_counts.values()) for category_counts in by_customer.values()]
    median = statistics.median(counts)
    lower, upper = 0.75 * median, 1.25 * median
    required_categories = set(categories)

    eligible = []
    for customer, category_counts in by_customer.items():
        count = sum(category_counts.values())
        if not (lower <= count <= upper):
            continue
        if not required_categories.issubset(category_counts):
            continue
        non_transport = count - category_counts["Transport"]
        eligible.append({
            "customer_id": customer,
            "transactions": count,
            "non_transport_transactions": non_transport,
            "non_transport_percent": non_transport / count * 100,
            "category_counts": category_counts,
        })

    # Highest non-Transport share first, then customer ID for a reproducible tie.
    eligible.sort(key=lambda row: (-row["non_transport_percent"], row["customer_id"]))
    if not eligible:
        raise ValueError("No eligible customers satisfy the three selection criteria")
    return median, lower, upper, eligible


def save_candidates(eligible, categories):
    fieldnames = ["rank", "customer_id", "transactions", "non_transport_transactions",
                  "non_transport_percent", *[f"count_{category}" for category in categories], "selected"]
    with RESULT_CSV.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        for rank, candidate in enumerate(eligible, start=1):
            row = {
                "rank": rank,
                "customer_id": candidate["customer_id"],
                "transactions": candidate["transactions"],
                "non_transport_transactions": candidate["non_transport_transactions"],
                "non_transport_percent": f'{candidate["non_transport_percent"]:.4f}',
                "selected": "Yes" if rank == 1 else "No",
            }
            for category in categories:
                row[f"count_{category}"] = candidate["category_counts"][category]
            writer.writerow(row)


def main():
    if not SOURCE_CSV.is_file():
        raise FileNotFoundError(f"Missing BankSim source CSV: {SOURCE_CSV}")
    mapping, import_customer = importer_constants()
    categories = sorted(set(mapping.values()))
    by_customer, transaction_count = filtered_counts(mapping)
    median, lower, upper, eligible = select_customer(by_customer, categories)
    selected = eligible[0]

    print("BankSim demonstration-customer selection (Section 3.10.3)")
    print(f"Filtered records: {transaction_count:,}; customers: {len(by_customer)}")
    print(f"Median transactions/customer: {median:g}")
    print(f"Eligible transaction range: {lower:g}–{upper:g} (inclusive)")
    print(f"Categories required: {', '.join(categories)}")
    print(f"Eligible customers: {len(eligible)}")
    print("\nRank  Customer           Transactions  Non-Transport  Non-Transport (%)")
    for rank, row in enumerate(eligible, 1):
        print(f'{rank:>4}  {row["customer_id"]:<17}  {row["transactions"]:>12}  '
              f'{row["non_transport_transactions"]:>13}  {row["non_transport_percent"]:>17.2f}')
    print(f'\nSelected: {selected["customer_id"]} '
          f'({selected["transactions"]} transactions; '
          f'{selected["non_transport_transactions"]} non-Transport = '
          f'{selected["non_transport_percent"]:.2f}%)')

    if selected["customer_id"] != import_customer:
        raise AssertionError(
            f'Selected {selected["customer_id"]}, but importer is configured for {import_customer}'
        )
    save_candidates(eligible, categories)
    print("Importer customer ID matches the independently selected result.")
    print(f"Saved ranking: {RESULT_CSV.relative_to(DATA_DIR.parent)}")


if __name__ == "__main__":
    main()
