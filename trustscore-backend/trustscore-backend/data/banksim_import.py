from pathlib import Path
from datetime import date, timedelta
from getpass import getpass
import csv

from database import supabase, supabase_admin


DATA_FILE = (
    Path(__file__).parent
    / "banksim"
    / "bs140513_032310.csv"
)

SELECTED_CUSTOMER_ID = "C1268275182"


# Map BankSim categories to the Tracker categories
CATEGORY_MAPPING = {
    "es_food": "Food & Drinks",
    "es_barsandrestaurants": "Food & Drinks",
    "es_hyper": "Food & Drinks",

    "es_transportation": "Transport",

    "es_fashion": "Shopping",
    "es_tech": "Shopping",

    "es_leisure": "Entertainment",
    "es_contents": "Entertainment",

    "es_sportsandtoys": "Fitness",

    "es_health": "Other",
    "es_wellnessandbeauty": "Other",
    "es_home": "Other",
    "es_hotelservices": "Other",
    "es_travel": "Other",
    "es_otherservices": "Other",
}


TRANSACTION_NAMES = {
    "es_food": "BankSim - Food",
    "es_barsandrestaurants": "BankSim - Bars & Restaurants",
    "es_hyper": "BankSim - Hypermarket",

    "es_transportation": "BankSim - Transportation",

    "es_fashion": "BankSim - Fashion",
    "es_tech": "BankSim - Technology",

    "es_leisure": "BankSim - Leisure",
    "es_contents": "BankSim - Contents",

    "es_sportsandtoys": "BankSim - Sports & Toys",

    "es_health": "BankSim - Health",
    "es_wellnessandbeauty": "BankSim - Wellness & Beauty",
    "es_home": "BankSim - Home",
    "es_hotelservices": "BankSim - Hotel Services",
    "es_travel": "BankSim - Travel",
    "es_otherservices": "BankSim - Other Services",
}


def clean_value(value):
    if value is None:
        return ""

    return value.strip().strip("'").strip('"')


def load_selected_customer():
    transactions = []

    with DATA_FILE.open(
        "r",
        encoding="utf-8",
        newline="",
    ) as file:

        reader = csv.DictReader(file)

        for row in reader:

            customer = clean_value(row.get("customer"))
            age = clean_value(row.get("age"))
            fraud = clean_value(row.get("fraud"))
            original_category = clean_value(
                row.get("category")
            )

            if customer != SELECTED_CUSTOMER_ID:
                continue

            if age != "1":
                continue

            if fraud != "0":
                continue

            app_category = CATEGORY_MAPPING.get(
                original_category
            )

            if app_category is None:
                continue

            try:
                amount = float(
                    clean_value(row.get("amount"))
                )

                step = int(
                    clean_value(row.get("step"))
                )

            except ValueError:
                continue

            transactions.append(
                {
                    "step": step,
                    "amount": amount,
                    "original_category": original_category,
                    "app_category": app_category,
                }
            )

    transactions.sort(
        key=lambda transaction: transaction["step"]
    )

    return transactions


def transform_transactions(transactions):
    if not transactions:
        return []

    max_step = max(
        transaction["step"]
        for transaction in transactions
    )

    #today = date.today()
    # Fixed date
    today = date(2026, 9, 29)

    transformed = []

    for transaction in transactions:

        days_before_today = (
            max_step - transaction["step"]
        )

        transaction_date = (
            today
            - timedelta(days=days_before_today)
        )

        original_category = (
            transaction["original_category"]
        )

        transformed.append(
            {
                "name": TRANSACTION_NAMES.get(
                    original_category,
                    "BankSim Transaction",
                ),
                "amount": transaction["amount"],
                "category": transaction["app_category"],
                "type": "expense",
                "is_recurring": False,
                "date": transaction_date.isoformat(),
            }
        )

    return transformed


def login_demo_account():
    print("\n" + "=" * 70)
    print("BANKSIM DEMO ACCOUNT LOGIN")
    print("=" * 70)

    email = input(
        "Enter the BankSim Demo account email: "
    ).strip()

    password = getpass(
        "Enter the BankSim Demo account password: "
    )

    try:
        response = (
            supabase.auth.sign_in_with_password(
                {
                    "email": email,
                    "password": password,
                }
            )
        )

    except Exception as error:
        print("\nLogin failed:")
        print(error)
        return None

    if not response.user:
        print("Login failed.")
        return None

    print("\nLogin successful.")

    return response.user.id

# Verify demo account is valid and does contain transactions, prevent duplicate imports
def verify_demo_account(user_id):

    profile_result = (
        supabase_admin
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        print(
            "No profile was found for this account."
        )
        return False

    profile = profile_result.data[0]

    print("\n" + "=" * 70)
    print("DEMO ACCOUNT")
    print("=" * 70)

    print(
        f"Name              : "
        f"{profile.get('name')}"
    )

    print(
        f"Age               : "
        f"{profile.get('age')}"
    )

    print(
        f"Employment status : "
        f"{profile.get('employment_status')}"
    )

    print(
        f"Monthly income    : "
        f"${float(profile.get('monthly_income') or 0):,.2f}"
    )

    transaction_result = (
        supabase_admin
        .table("transactions")
        .select("id")
        .eq("user_id", user_id)
        .execute()
    )

    existing_count = len(
        transaction_result.data or []
    )

    print(
        f"Existing expenses : "
        f"{existing_count}"
    )

    if existing_count != 0:

        print(
            "\nIMPORT ABORTED."
        )

        print(
            "This account already contains transactions."
        )

        print(
            "Use a fresh BankSim Demo account"
        )

        return False

    return True


def import_transactions(
    user_id,
    transactions,
):
    """ Insert transformed BankSim transactions into transactions table """

    rows = []

    for transaction in transactions:

        rows.append(
            {
                "user_id": user_id,
                "name": transaction["name"],
                "amount": transaction["amount"],
                "category": transaction["category"],
                "type": transaction["type"],
                "is_recurring": transaction[
                    "is_recurring"
                ],
                "date": transaction["date"],
            }
        )

    # Insert in smaller batches 
    batch_size = 50

    inserted = 0

    for start in range(
        0,
        len(rows),
        batch_size,
    ):

        batch = rows[
            start:start + batch_size
        ]

        result = (
            supabase_admin
            .table("transactions")
            .insert(batch)
            .execute()
        )

        if not result.data:
            raise RuntimeError(
                "A database batch failed to insert."
            )

        inserted += len(result.data)

        print(
            f"Imported {inserted}/{len(rows)} "
            f"transactions..."
        )

    return inserted


def main():

    if not DATA_FILE.exists():

        print("BankSim CSV could not be found:")
        print(DATA_FILE)

        return

    original_transactions = (
        load_selected_customer()
    )

    transformed_transactions = (
        transform_transactions(
            original_transactions
        )
    )

    print("=" * 70)
    print("BANKSIM APP IMPORT")
    print("=" * 70)

    print(
        f"BankSim customer : "
        f"{SELECTED_CUSTOMER_ID}"
    )

    print(
        f"Transactions     : "
        f"{len(transformed_transactions)}"
    )

    if transformed_transactions:

        print(
            f"Date range       : "
            f"{transformed_transactions[0]['date']} "
            f"to "
            f"{transformed_transactions[-1]['date']}"
        )

        total_spending = sum(
            transaction["amount"]
            for transaction
            in transformed_transactions
        )

        print(
            f"Total spending   : "
            f"${total_spending:,.2f}"
        )

    user_id = login_demo_account()

    if user_id is None:
        return

    if not verify_demo_account(user_id):
        return

    print("\n" + "=" * 70)
    print("READY TO IMPORT")
    print("=" * 70)

    print(
        "176 BankSim transactions will be inserted "
    )

    print(
        "No bills or profile values will be changed."
    )

    confirmation = input(
        '\nType IMPORT to continue: '
    ).strip()

    if confirmation != "IMPORT":

        print("\nImport cancelled.")
        return

    try:

        inserted = import_transactions(
            user_id,
            transformed_transactions,
        )

    except Exception as error:

        print("\nIMPORT FAILED:")
        print(error)
        return

    print("\n" + "=" * 70)
    print("IMPORT COMPLETE")
    print("=" * 70)

    print(
        f"Successfully imported "
        f"{inserted} transactions."
    )

    print(
        "\nrefresh/reopen the tracker anmd dashboard to see the new transactions."
    )


if __name__ == "__main__":
    main()