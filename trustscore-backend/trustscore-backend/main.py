from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.concurrency import run_in_threadpool
from datetime import date
import copy
import calendar
import math

from database import supabase, supabase_admin
from schemas import (
    RegisterRequest, LoginRequest, RefreshRequest, ProfileUpdate, ProfileResponse,
    TransactionCreate, TransactionResponse,
    BillCreate, BillUpdate, BillResponse,
    SimulationRequest, SimulationResponse,

)
from trust_score.trust_score_engine import (
    TrustScoreEngine, FinancialData
)
from trust_score.insight_engine import InsightEngine
from trust_score.insight_generator import InsightGenerator


# App setup
app = FastAPI(
    title="TrustScore API",
    description="Backend API for Trust Score Engine for Gen Z Credit Simulation",
    version="1.0.0",
)

#  request from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all for development, restrict later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Trust Score Engine
engine = TrustScoreEngine()

# Analyses transaction history
insight_engine = InsightEngine()

# LLM only writes the final feedback.
insight_generator = InsightGenerator()

# Number of months used to calculate the Trust Score
ROLLING_HISTORY_MONTHS = 6

# Authentication
security = HTTPBearer()



# Get user ID from auth token
async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> str:

    try:
        token = credentials.credentials
        user_response = supabase.auth.get_user(token)
        if user_response and user_response.user:
            return user_response.user.id
        raise HTTPException(status_code=401, detail="Invalid token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")



# Health check
@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "app": "TrustScore API",
        "version": "1.0.0",
    }



# Authentication
@app.post("/auth/register")
async def register(data: RegisterRequest):
    """Register a new user account."""
    try:
        # Create user account
        auth_response = supabase.auth.sign_up({
            "email": data.email,
            "password": data.password,
        })

        if not auth_response.user:
            raise HTTPException(status_code=400, detail="Registration failed")

        user_id = auth_response.user.id

        # Create user profile
        supabase_admin.table("profiles").upsert(
            {
                "id": user_id,
                "name": data.name,
                "age": data.age,
            },
            on_conflict="id",
        ).execute()

        return {
            "message": "Registration successful",
            "user_id": user_id,
            "access_token": auth_response.session.access_token
                if auth_response.session else None,
            "refresh_token": auth_response.session.refresh_token
                if auth_response.session else None,
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/auth/login")
async def login(data: LoginRequest):
    """Log in an existing user."""
    try:
        # Login with Supabase
        auth_response = supabase.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })

        if not auth_response.user:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return {
            "message": "Login successful",
            "user_id": auth_response.user.id,
            "access_token": auth_response.session.access_token,
            "refresh_token": auth_response.session.refresh_token,
        }

    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))

# Refresh access token
@app.post("/auth/refresh")
async def refresh_session(data: RefreshRequest):
    
    try:
        auth_response = supabase.auth.refresh_session(data.refresh_token)

        if not auth_response.session:
            raise HTTPException(status_code=401, detail="Invalid refresh token")

        return {
            "message": "Session refreshed",
            "user_id": auth_response.user.id if auth_response.user else None,
            "access_token": auth_response.session.access_token,
            "refresh_token": auth_response.session.refresh_token,
        }

    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Refresh failed: {str(e)}")


@app.get("/auth/profile", response_model=ProfileResponse)
async def get_profile(user_id: str = Depends(get_current_user_id)):
    """Get the current user's profile."""

    # Get user profile
    result = (
        supabase_admin.table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = result.data[0]

    return ProfileResponse(
        id=profile["id"],
        name=profile["name"],
        age=profile.get("age"),
        employment_status=profile.get("employment_status"),
        monthly_income=float(profile.get("monthly_income", 0)),
        onboarding_completed=profile.get("onboarding_completed", False),
        created_at=profile.get("created_at"),
    )


@app.put("/auth/profile")
async def update_profile(
    data: ProfileUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Update the current user's profile."""

    update_data = data.model_dump(exclude_none=True)

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase_admin.table("profiles")
        .update(update_data)
        .eq("id", user_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    return {"message": "Profile updated successfully"}


# Transactions
@app.post("/transactions", response_model=TransactionResponse)
async def create_transaction(
    data: TransactionCreate, user_id: str = Depends(get_current_user_id)
):
    """Log a new income or expense transaction."""

    insert_data = {
        "user_id": user_id,
        "name": data.name,
        "amount": data.amount,
        "category": data.category,
        "type": data.type,
        "is_recurring": data.is_recurring,
        "date": str(data.date or date.today()),
    }

    result = supabase_admin.table("transactions").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create transaction")

    txn = result.data[0]
    return TransactionResponse(
        id=txn["id"],
        name=txn["name"],
        amount=float(txn["amount"]),
        category=txn["category"],
        type=txn["type"],
        is_recurring=txn["is_recurring"],
        date=txn["date"],
        created_at=txn.get("created_at"),
    )



@app.delete("/transactions/{transaction_id}")
async def delete_transaction(
    transaction_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Delete a manually entered spending transaction.
    Spending entries automatically created from bill payments must be managed through the Bills tab so that the bill status and spending total remain consistent.
    """

    transaction_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("id", transaction_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not transaction_result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")

    transaction = transaction_result.data[0]

    if transaction.get("is_recurring", False):
        raise HTTPException(
            status_code=400,
            detail="Bill-generated spending must be managed through the Bills tab.",
        )

    (
        supabase_admin.table("transactions")
        .delete()
        .eq("id", transaction_id)
        .eq("user_id", user_id)
        .execute()
    )

    return {"message": "Transaction deleted successfully"}


# Monthly recurring bill helpers
def _get_month_bounds(month: int, year: int):
    """Return the first day of a month and the first day of the next month."""

    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Invalid month")

    month_start = date(year, month, 1)

    if month == 12:
        next_month_start = date(year + 1, 1, 1)
    else:
        next_month_start = date(year, month + 1, 1)

    return month_start, next_month_start


def _build_due_date(year: int, month: int, due_day: int) -> date:
    """Build a valid bill due date, safely handling shorter months."""

    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, min(due_day, last_day))

# Sync bill and spending transaction 
def _sync_bill_payment_transaction(user_id: str, bill: dict, status: str):
    linked_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .eq("bill_id", bill["id"])
        .execute()
    )
    linked_transactions = linked_result.data or []

    if status in ("paid_on_time", "late") and float(bill["amount"]) > 0:
        transaction_data = {
            "user_id": user_id,
            "name": f"Bill: {bill['name']}",
            "amount": float(bill["amount"]),
            "category": "Bills",
            "type": "expense",
            "is_recurring": True,
            "date": str(bill["due_date"]),
            "bill_id": bill["id"],
        }

        if linked_transactions:
            (
                supabase_admin.table("transactions")
                .update(transaction_data)
                .eq("id", linked_transactions[0]["id"])
                .eq("user_id", user_id)
                .execute()
            )
        else:
            supabase_admin.table("transactions").insert(transaction_data).execute()

    elif status in ("missed", "upcoming"):
        (
            supabase_admin.table("transactions")
            .delete()
            .eq("user_id", user_id)
            .eq("bill_id", bill["id"])
            .execute()
        )

# Create missing recurring bills for a month
def _ensure_bill_occurrences_for_month(user_id: str, month: int, year: int):
    

    month_start, next_month_start = _get_month_bounds(month, year)

    template_result = (
        supabase_admin.table("bill_templates")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .lt("start_date", str(next_month_start))
        .execute()
    )

    for template in template_result.data or []:
        due_date = _build_due_date(year, month, int(template["due_day"]))
        start_date = date.fromisoformat(str(template["start_date"]))

        if due_date < start_date:
            continue

        occurrence_result = (
            supabase_admin.table("bills")
            .select("id")
            .eq("user_id", user_id)
            .eq("template_id", template["id"])
            .gte("due_date", str(month_start))
            .lt("due_date", str(next_month_start))
            .execute()
        )

        if occurrence_result.data:
            continue

        (
            supabase_admin.table("bills")
            .insert({
                "user_id": user_id,
                "template_id": template["id"],
                "name": template["name"],
                "amount": float(template["amount"]),
                "due_date": str(due_date),
                "status": "upcoming",
            })
            .execute()
        )


@app.get("/tracker/overview")
async def get_tracker_overview(
    month: int, year: int, user_id: str = Depends(get_current_user_id)
):
    """Get Tracker totals, spending and bill occurrences for one month."""

    profile_result = (
        supabase_admin.table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_result.data[0]
    monthly_income = float(profile.get("monthly_income", 0))
    month_start, next_month_start = _get_month_bounds(month, year)
    start_date = str(month_start)
    end_date = str(next_month_start)

    # Create missing recurring bills for the selected month
    _ensure_bill_occurrences_for_month(user_id, month, year)

    txn_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .eq("type", "expense")
        .gte("date", start_date)
        .lt("date", end_date)
        .execute()
    )
    expenses = txn_result.data or []

    # Real spending is used for Tracker totals and Savings Behaviour.
    total_expenses = sum(float(t["amount"]) for t in expenses)
    total_saved = max(0, monthly_income - total_expenses)

    # Category-adjusted spending is used only for Spending Discipline.
    adjusted_total_expenses = sum(
        engine.adjust_spending_amount(
            float(transaction["amount"]),
            transaction.get("category"),
        )
        for transaction in expenses
    )

    if monthly_income > 0:
        spending_ratio = round((total_expenses / monthly_income) * 100, 1)
        adjusted_spending_ratio = round(
            (adjusted_total_expenses / monthly_income) * 100,
            1,
        )

        if spending_ratio >= 100:
            ratio_grade = "F"
            ratio_message = "You spent all or more than your income/allowance this month."
        elif spending_ratio <= 50:
            ratio_grade = "A"
            ratio_message = "Excellent spending control for this month."
        elif spending_ratio <= 60:
            ratio_grade = "A"
            ratio_message = "Good spending control for this month."
        elif spending_ratio <= 70:
            ratio_grade = "B"
            ratio_message = "Moderate spending this month. Review your expenses to stay in control."
        elif spending_ratio <= 80:
            ratio_grade = "D"
            ratio_message = "Spending is getting tight this month. Consider reducing non-essential purchases."
        elif spending_ratio <= 90:
            ratio_grade = "F"
            ratio_message = "High spending this month. This may lower your Spending Discipline score."
        else:
            ratio_grade = "F"
            ratio_message = "Very high spending this month. Try to cut back before reaching your full income/allowance."

    else:
        spending_ratio = 0
        adjusted_spending_ratio = 0
        ratio_grade = "D"
        ratio_message = "Set your monthly income or allowance in Settings for accurate tracking."

    spending_by_category = {}
    for txn in expenses:
        category = txn["category"]
        spending_by_category[category] = spending_by_category.get(category, 0) + float(txn["amount"])

    categories = []
    for category in sorted(spending_by_category.keys()):
        categories.append({
            "category": category,
            "total_spent": spending_by_category[category],
        })

    bill_result = (
        supabase_admin.table("bills")
        .select("*")
        .eq("user_id", user_id)
        .gte("due_date", start_date)
        .lt("due_date", end_date)
        .order("due_date", desc=False)
        .execute()
    )
    bills = bill_result.data or []

    recent_transaction_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .gte("date", start_date)
        .lt("date", end_date)
        .order("date", desc=True)
        .limit(20)
        .execute()
    )

    return {
        "month": month,
        "year": year,
        "monthly_income": monthly_income,
        "total_expenses": total_expenses,
        "adjusted_total_expenses": round(adjusted_total_expenses, 2),
        "total_saved": total_saved,
        "spending_ratio": spending_ratio,
        "adjusted_spending_ratio": adjusted_spending_ratio,
        "ratio_grade": ratio_grade,
        "ratio_message": ratio_message,
        "categories": categories,
        "bills": bills,
        "bills_paid_on_time": len([b for b in bills if b["status"] == "paid_on_time"]),
        "bills_total_resolved": len([b for b in bills if b["status"] != "upcoming"]),
        "bills_upcoming": len([b for b in bills if b["status"] == "upcoming"]),
        "recent_transactions": recent_transaction_result.data or [],
    }



# Bills
@app.post("/bills", response_model=BillResponse)
async def create_bill(data: BillCreate, user_id: str = Depends(get_current_user_id)):
    """Create a monthly recurring bill template and its first occurrence."""

    try:
        first_due_date = date.fromisoformat(str(data.due_date))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid due date. Use YYYY-MM-DD.")

    template_result = (
        supabase_admin.table("bill_templates")
        .insert({
            "user_id": user_id,
            "name": data.name,
            "amount": float(data.amount),
            "due_day": first_due_date.day,
            "is_active": True,
            "start_date": str(first_due_date),
        })
        .execute()
    )

    if not template_result.data:
        raise HTTPException(status_code=500, detail="Failed to create recurring bill template")

    template = template_result.data[0]

    occurrence_result = (
        supabase_admin.table("bills")
        .insert({
            "user_id": user_id,
            "template_id": template["id"],
            "name": data.name,
            "amount": float(data.amount),
            "due_date": str(first_due_date),
            "status": data.status,
        })
        .execute()
    )

    if not occurrence_result.data:
        (
            supabase_admin.table("bill_templates")
            .delete()
            .eq("id", template["id"])
            .eq("user_id", user_id)
            .execute()
        )
        raise HTTPException(status_code=500, detail="Failed to create first monthly bill occurrence")

    bill = occurrence_result.data[0]
    _sync_bill_payment_transaction(user_id, bill, bill["status"])

    return BillResponse(
        id=bill["id"],
        name=bill["name"],
        amount=float(bill["amount"]),
        due_date=bill["due_date"],
        status=bill["status"],
        created_at=bill.get("created_at"),
    )




@app.put("/bills/{bill_id}")
async def update_bill(
    bill_id: str, data: BillUpdate, user_id: str = Depends(get_current_user_id)
):
    """
    Update one monthly bill occurrence without modifying any other month.

    Paid bills create a spending transaction dated in their due month.
    Missed or upcoming bills keep their outcome but have no paid spending entry.
    """

    bill_result = (
        supabase_admin.table("bills")
        .select("*")
        .eq("id", bill_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill occurrence not found")

    updated_result = (
        supabase_admin.table("bills")
        .update({"status": data.status})
        .eq("id", bill_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not updated_result.data:
        raise HTTPException(status_code=500, detail="Failed to update bill occurrence")

    updated_bill = updated_result.data[0]
    _sync_bill_payment_transaction(user_id, updated_bill, data.status)

    return {"message": f"Bill updated to {data.status}"}


@app.delete("/bills/{bill_id}")
async def delete_bill(
    bill_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Stop tracking a recurring bill.
    Recorded paid/late/missed occurrence history is preserved. Upcoming unresolved occurrences are removed and no future occurrences are created.
    """

    bill_result = (
        supabase_admin.table("bills")
        .select("*")
        .eq("id", bill_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill occurrence not found")

    bill = bill_result.data[0]
    template_id = bill.get("template_id")

    if template_id:
        (
            supabase_admin.table("bill_templates")
            .update({"is_active": False})
            .eq("id", template_id)
            .eq("user_id", user_id)
            .execute()
        )

        upcoming_result = (
            supabase_admin.table("bills")
            .select("id")
            .eq("user_id", user_id)
            .eq("template_id", template_id)
            .eq("status", "upcoming")
            .execute()
        )

        for upcoming_bill in upcoming_result.data or []:
            (
                supabase_admin.table("transactions")
                .delete()
                .eq("user_id", user_id)
                .eq("bill_id", upcoming_bill["id"])
                .execute()
            )
            (
                supabase_admin.table("bills")
                .delete()
                .eq("id", upcoming_bill["id"])
                .eq("user_id", user_id)
                .execute()
            )

        return {"message": "Recurring bill stopped. Recorded payment history has been kept."}

    # Handle old standalone bills
    (
        supabase_admin.table("transactions")
        .delete()
        .eq("user_id", user_id)
        .eq("bill_id", bill_id)
        .execute()
    )
    (
        supabase_admin.table("bills")
        .delete()
        .eq("id", bill_id)
        .eq("user_id", user_id)
        .execute()
    )
    return {"message": "Bill deleted successfully"}

@app.delete("/bills/{bill_id}/history")
async def delete_bill_history(
    bill_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Delete all history for a recurring bill.

    This removes:
    - all bill occurrences linked to the same recurring template
    - all spending transactions created from those bill occurrences
    - the recurring bill template itself

    This is only used when a bill was added by mistake.
    """

    bill_result = (
        supabase_admin.table("bills")
        .select("*")
        .eq("id", bill_id)
        .eq("user_id", user_id)
        .execute()
    )

    if not bill_result.data:
        raise HTTPException(status_code=404, detail="Bill occurrence not found")

    bill = bill_result.data[0]
    template_id = bill.get("template_id")

    if template_id:
        occurrences_result = (
            supabase_admin.table("bills")
            .select("id")
            .eq("user_id", user_id)
            .eq("template_id", template_id)
            .execute()
        )

        occurrence_ids = [
            occurrence["id"]
            for occurrence in (occurrences_result.data or [])
        ]

        for occurrence_id in occurrence_ids:
            (
                supabase_admin.table("transactions")
                .delete()
                .eq("user_id", user_id)
                .eq("bill_id", occurrence_id)
                .execute()
            )

            (
                supabase_admin.table("bills")
                .delete()
                .eq("id", occurrence_id)
                .eq("user_id", user_id)
                .execute()
            )

        (
            supabase_admin.table("bill_templates")
            .delete()
            .eq("id", template_id)
            .eq("user_id", user_id)
            .execute()
        )

        return {
            "message": "Bill history deleted successfully."
        }

    # Handle old standalone bills
    (
        supabase_admin.table("transactions")
        .delete()
        .eq("user_id", user_id)
        .eq("bill_id", bill_id)
        .execute()
    )

    (
        supabase_admin.table("bills")
        .delete()
        .eq("id", bill_id)
        .eq("user_id", user_id)
        .execute()
    )

    return {
        "message": "Bill deleted successfully."
    }


# Trust Score
def _shift_month_start(month_start: date, months: int) -> date:
    """Move a first-of-month date forward or backward by whole months."""

    total_months = month_start.year * 12 + (month_start.month - 1) + months
    year, zero_based_month = divmod(total_months, 12)
    return date(year, zero_based_month + 1, 1)


def _get_rolling_score_period(completed_months: int = ROLLING_HISTORY_MONTHS):
    """
    Return the latest completed-calendar-month history window.
    The current in-progress month is excluded to prevent a partial month from distorting monthly averages or regression trends. Missing months inside the fixed calendar window remain missing rather than being treated as zero.
    """

    today = date.today()
    current_month_start = today.replace(day=1)
    period_end = current_month_start
    period_start = _shift_month_start(current_month_start, -completed_months)
    return period_start, period_end, current_month_start


def _format_month_label(month_key: str) -> str:
    """Convert YYYY-MM into a compact user-facing month label."""

    year, month = [int(value) for value in month_key.split("-")]
    return date(year, month, 1).strftime("%b %Y")


def _get_current_month_activity(user_id: str, monthly_income: float) -> dict:
    """
    Return current in-progress month activity for LLM context only.
    These values are intentionally separate from the completed-month Trust Score and regression window. They let personalised advice react to recent behaviour without treating a partial month as a full historical month.
    """

    today = date.today()
    month_start, month_end = _get_month_bounds(today.month, today.year)
    month_key = month_start.strftime("%Y-%m")

    transaction_result = (
        supabase_admin.table("transactions")
        .select("amount, category, type, is_recurring, date")
        .eq("user_id", user_id)
        .eq("type", "expense")
        .gte("date", str(month_start))
        .lt("date", str(month_end))
        .execute()
    )
    transactions = transaction_result.data or []

    total_spending = sum(float(item.get("amount", 0) or 0) for item in transactions)
    category_totals = {category: 0.0 for category in insight_engine.SPENDING_CATEGORIES}

    for transaction in transactions:
        if transaction.get("is_recurring", False):
            continue
        category = transaction.get("category")
        if category in category_totals:
            category_totals[category] += float(transaction.get("amount", 0) or 0)

    non_bill_spending = sum(category_totals.values())
    top_non_bill_category = None
    positive_categories = {
        category: amount
        for category, amount in category_totals.items()
        if amount > 0
    }
    if positive_categories:
        top_name = max(positive_categories, key=positive_categories.get)
        top_non_bill_category = {
            "category": top_name,
            "amount": round(positive_categories[top_name], 2),
        }

    bill_result = (
        supabase_admin.table("bills")
        .select("status")
        .eq("user_id", user_id)
        .gte("due_date", str(month_start))
        .lt("due_date", str(month_end))
        .execute()
    )
    bills = bill_result.data or []
    resolved_bills = [
        bill
        for bill in bills
        if bill.get("status") in ("paid_on_time", "late", "missed")
    ]

    spending_ratio_so_far = None
    if monthly_income and monthly_income > 0:
        spending_ratio_so_far = round((total_spending / monthly_income) * 100, 1)

    return {
        "month_key": month_key,
        "label": _format_month_label(month_key),
        "in_progress": True,
        "has_activity": bool(transactions or bills),
        "transaction_count": len(transactions),
        "total_spending_so_far": round(total_spending, 2),
        "non_bill_spending_so_far": round(non_bill_spending, 2),
        "spending_to_income_percent_so_far": spending_ratio_so_far,
        "category_spending_so_far": {
            category: round(amount, 2)
            for category, amount in category_totals.items()
            if amount > 0
        },
        "top_non_bill_category": top_non_bill_category,
        "bills": {
            "total_tracked": len(bills),
            "resolved": len(resolved_bills),
            "paid_on_time": len([b for b in resolved_bills if b.get("status") == "paid_on_time"]),
            "late": len([b for b in resolved_bills if b.get("status") == "late"]),
            "missed": len([b for b in resolved_bills if b.get("status") == "missed"]),
        },
    }


# Replace current month spending for simulation
def _replace_current_month_spending_for_simulation(
    data: FinancialData,
    simulated_current_spending: float,
    simulated_current_purchase_count: int,
    simulated_current_adjusted_spending: float | None = None,
):
    """Replace the current-month spending values inside a copied FinancialData object."""

    today_month_key = date.today().strftime("%Y-%m")
    current_month = next(
        (
            month
            for month in data.spending_months
            if month.get("month_key") == today_month_key
        ),
        None,
    )

    # If no adjusted value is supplied, preserve the current month's category mix.
    # When no category history exists, use a neutral 1.00 multiplier.
    if simulated_current_adjusted_spending is None:
        current_actual = (
            float(current_month.get("total_spending", 0))
            if current_month
            else 0.0
        )
        current_adjusted = (
            float(current_month.get("adjusted_spending", current_actual))
            if current_month
            else 0.0
        )
        category_mix_multiplier = (
            current_adjusted / current_actual
            if current_actual > 0
            else 1.0
        )
        simulated_current_adjusted_spending = (
            float(simulated_current_spending) * category_mix_multiplier
        )

    previous_months = [
        month
        for month in data.spending_months
        if month.get("month_key") != today_month_key
    ]

    simulated_month = {
        "month_key": today_month_key,
        "label": _format_month_label(today_month_key),
        "total_spending": round(float(simulated_current_spending), 2),
        "adjusted_spending": round(float(simulated_current_adjusted_spending), 2),
        "is_current_month": True,
        "in_progress": True,
        "simulated": True,
    }

    data.spending_months = previous_months + [simulated_month]
    data.spending_month_count = len(data.spending_months)

    data.monthly_spending = (
        sum(float(month["total_spending"]) for month in data.spending_months)
        / data.spending_month_count
    )

    data.adjusted_monthly_spending = (
        sum(
            float(month.get("adjusted_spending", month["total_spending"]))
            for month in data.spending_months
        )
        / data.spending_month_count
    )

    historical_purchase_count = max(
        0,
        data.total_purchases_count - data.current_month_purchase_count,
    )
    data.current_month_purchase_count = max(1, simulated_current_purchase_count)
    data.total_purchases_count = (
        historical_purchase_count + data.current_month_purchase_count
    )


# Gather financial data for rolling Trust Score calculation
def _gather_financial_data(
    user_id: str,
    profile: dict,
    completed_months: int = ROLLING_HISTORY_MONTHS,
) -> FinancialData:

    period_start, period_end, current_month_start = _get_rolling_score_period(
        completed_months
    )
    current_month_key = current_month_start.strftime("%Y-%m")
    monthly_income = float(profile.get("monthly_income", 0))
    raw_baseline_payment = profile.get("baseline_payment")
    baseline_payment = (
        float(raw_baseline_payment)
        if raw_baseline_payment is not None
        else -1.0
    )

    # Payment data
    bills_result = (
        supabase_admin.table("bills")
        .select("*")
        .eq("user_id", user_id)
        .gte("due_date", str(period_start))
        .lt("due_date", str(period_end))
        .execute()
    )
    bills = bills_result.data or []
    resolved_bills = [
        bill
        for bill in bills
        if bill["status"] in ("paid_on_time", "late", "missed")
    ]

    total_bills = len(resolved_bills)
    bills_on_time = len([
        bill for bill in resolved_bills if bill["status"] == "paid_on_time"
    ])
    bills_late = len([
        bill for bill in resolved_bills if bill["status"] == "late"
    ])
    bills_missed = len([
        bill for bill in resolved_bills if bill["status"] == "missed"
    ])

    # A negative onboarding value means the user explicitly selected "I don't have bills". If they later add any bill record, stop treating Payment Consistency as not applicable even when no completed-history payment outcome exists yet.
    payment_not_applicable = False
    if baseline_payment < 0 and total_bills == 0:
        any_bill_result = (
            supabase_admin.table("bills")
            .select("id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        payment_not_applicable = not bool(any_bill_result.data)


    # Spending data
    transaction_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .eq("type", "expense")
        .gte("date", str(period_start))
        .lt("date", str(period_end))
        .execute()
    )
    expense_transactions = transaction_result.data or []

    monthly_totals = {}
    monthly_adjusted_totals = {}
    monthly_counts = {}

    for transaction in expense_transactions:
        month_key = str(transaction["date"])[:7]
        amount = float(transaction["amount"])
        category = transaction.get("category")

        monthly_totals[month_key] = (
            monthly_totals.get(month_key, 0) + amount
        )
        monthly_adjusted_totals[month_key] = (
            monthly_adjusted_totals.get(month_key, 0)
            + engine.adjust_spending_amount(amount, category)
        )
        monthly_counts[month_key] = monthly_counts.get(month_key, 0) + 1

    spending_months = [
        {
            "month_key": month_key,
            "label": _format_month_label(month_key),
            "total_spending": round(monthly_totals[month_key], 2),
            "adjusted_spending": round(monthly_adjusted_totals[month_key], 2),
            "is_current_month": month_key == current_month_key,
            "in_progress": month_key == current_month_key,
        }
        for month_key in sorted(monthly_totals.keys())
    ]

    spending_month_count = len(spending_months)

    average_monthly_spending = (
        sum(monthly_totals.values()) / spending_month_count
        if spending_month_count > 0
        else 0.0
    )

    average_adjusted_monthly_spending = (
        sum(monthly_adjusted_totals.values()) / spending_month_count
        if spending_month_count > 0
        else 0.0
    )
    current_month_purchase_count = int(monthly_counts.get(current_month_key, 0))
    total_purchases = len(expense_transactions)

    manual_purchases = len([
        transaction for transaction in expense_transactions
        if not transaction.get("is_recurring", False)
    ])


    return FinancialData(
        total_bills=total_bills,
        bills_paid_on_time=bills_on_time,
        bills_paid_late=bills_late,
        bills_missed=bills_missed,
        monthly_spending=average_monthly_spending,
        adjusted_monthly_spending=average_adjusted_monthly_spending,
        monthly_income=monthly_income,
        total_purchases_count=total_purchases,
        manual_purchases_count=manual_purchases,
        baseline_payment=baseline_payment,
        baseline_spending=float(profile.get("baseline_spending", -1)),
        baseline_savings=float(profile.get("baseline_savings", -1)),
        payment_not_applicable=payment_not_applicable,
        uses_rolling_history=True,
        spending_month_count=spending_month_count,
        spending_months=spending_months,
        current_month_purchase_count=current_month_purchase_count,
    )


@app.get("/insights")
async def get_behavioural_insights(
    user_id: str = Depends(get_current_user_id),
):
    """
    Analyse completed-month expense history for behavioural insights.
    Historical trends use the same latest six completed calendar months as the Trust Score. 
    The current in-progress month is returned separately as recent activity for personalised advice and is not included in regression trends.
    """

    profile_result = (
        supabase_admin.table("profiles")
        .select("monthly_income")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    monthly_income = float(
        profile_result.data[0].get("monthly_income", 0) or 0
    )

    period_start, period_end, _ = _get_rolling_score_period()

    transaction_result = (
        supabase_admin.table("transactions")
        .select("amount, category, type, is_recurring, date")
        .eq("user_id", user_id)
        .eq("type", "expense")
        .gte("date", str(period_start))
        .lt("date", str(period_end))
        .execute()
    )

    transactions = transaction_result.data or []

    result = insight_engine.analyse(
        transactions=transactions,
        monthly_income=monthly_income,
    )
    current_month_activity = _get_current_month_activity(
        user_id,
        monthly_income,
    )

    return {
        "period_start": str(period_start),
        "period_end": str(period_end),
        "history_basis": "latest_6_completed_calendar_months",
        "monthly_income": monthly_income,
        "current_month_activity": current_month_activity,
        **result,
    }


@app.post("/insights/advice")
async def generate_behavioural_advice(
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate dynamic, personalised credit-focused feedback

    The TrustScoreEngine and InsightEngine calculate the facts.
    OpenAI receives the context and behavioural observations, and is used solely to turn them into concise natural-language feedback.
    This endpoint does not modify the Trust Score or any database records.
    """

    # Behavioural trends from the same rolling six-month window.
    insights = await get_behavioural_insights(user_id=user_id)

    # Build the current Trust Score context without calling GET /score so this advice request does not create or modify score-history records.
    profile_result = (
        supabase_admin.table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_result.data[0]
    financial_data = _gather_financial_data(user_id, profile)
    score_result = engine.calculate_score(financial_data)

    current_activity = insights.get("current_month_activity") or {}
    current_bill_context = current_activity.get("bills") or {}

    if financial_data.total_bills > 0:
        payment_status = "tracked_history"
    elif financial_data.baseline_payment >= 0:
        payment_status = "self_reported"
    elif current_bill_context.get("total_tracked", 0) > 0:
        payment_status = "current_month_only"
    elif financial_data.payment_not_applicable:
        payment_status = "not_applicable"
    else:
        payment_status = "no_data"

    score_context = {
        "total_score": score_result.total_score,
        "grade": score_result.grade,
        "confidence": score_result.confidence,
        "history_basis": "latest_6_completed_calendar_months",
        "components": [
            {
                "name": component.name,
                "score": component.score,
                "weight": component.weight,
                "grade": component.grade,
                "factors": component.factors,
            }
            for component in score_result.components
        ],
        "payment": {
            "status": payment_status,
            "total_bills": financial_data.total_bills,
            "paid_on_time": financial_data.bills_paid_on_time,
            "late": financial_data.bills_paid_late,
            "missed": financial_data.bills_missed,
            "current_month": current_bill_context,
        },
        "category_multipliers": dict(engine.CATEGORY_MULTIPLIERS),
    }

    generated = await run_in_threadpool(
        insight_generator.generate,
        insights,
        score_context,
    )

    return {
        "text": generated.get("text"),
        "source": generated.get("source"),
        "model": generated.get("model"),
        "error": generated.get("error"),
        "input_tokens": generated.get("input_tokens"),
        "output_tokens": generated.get("output_tokens"),
    }


@app.get("/score")
async def calculate_score(user_id: str = Depends(get_current_user_id)):
    # Get user profile
    profile_result = supabase_admin.table("profiles").select("*").eq("id", user_id).execute()
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    profile = profile_result.data[0]

    # Gather financial data
    fin_data = _gather_financial_data(user_id, profile)

   

    # Calculate score
    result = engine.calculate_score(fin_data)

    # Save score only if score changed
    last_score_result = (
        supabase_admin.table("trust_scores")
        .select("total_score")
        .eq("user_id", user_id)
        .order("calculated_at", desc=True)
        .limit(1)
        .execute()
    )
    last_score = last_score_result.data[0]["total_score"] if last_score_result.data else None

    if last_score is None or last_score != result.total_score:
        supabase_admin.table("trust_scores").insert({
            "user_id": user_id,
            "total_score": result.total_score,
            "payment_consistency_score": result.components[0].score,
            "spending_discipline_score": result.components[1].score,
            "savings_behaviour_score": result.components[2].score,
            "grade": result.grade,
        }).execute()

    return {
        "total_score": result.total_score,
        "grade": result.grade,
        "components": [
            {
                "name": c.name,
                "score": c.score,
                "weight": c.weight,
                "weighted_score": c.weighted_score,
                "grade": c.grade,
                "feedback": c.feedback,
                "factors": c.factors,
            }
            for c in result.components
        ],
        "summary": result.summary,
        "confidence": result.confidence,
        "confidence_message": result.confidence_message,
        "calculated_at": result.timestamp,
    }



@app.get("/score/history")
async def get_score_history(
    limit: int = 12, user_id: str = Depends(get_current_user_id)
):
    """Get historical trust scores for the score trend chart."""

    result = (
        supabase_admin.table("trust_scores")
        .select("total_score, grade, calculated_at")
        .eq("user_id", user_id)
        .order("calculated_at", desc=True)
        .limit(limit)
        .execute()
    )

    # Return oldest score first for chart
    scores = result.data or []
    scores.reverse()

    return scores


# Simulator
# Calculate temporary Trust Score without changing tracked data
SIMULATOR_SPENDING_CATEGORIES = [
    "Food & Drinks",
    "Transport",
    "Shopping",
    "Entertainment",
    "Gaming",
    "Fitness",
    "Other",
]


def _current_category_spending(non_bill_expenses):
    """Return current-month non-bill spending grouped into Simulator categories."""

    category_totals = {category: 0.0 for category in SIMULATOR_SPENDING_CATEGORIES}

    for transaction in non_bill_expenses:
        category = transaction.get("category")
        if category not in category_totals:
            category = "Other"

        category_totals[category] += float(transaction["amount"])

    return {
        category: round(amount, 2)
        for category, amount in category_totals.items()
    }


def _normalise_simulated_category_spending(category_spending):
    """Validate and normalise category-slider values from a simulation request."""

    if category_spending is None:
        return None

    unknown_categories = set(category_spending.keys()) - set(SIMULATOR_SPENDING_CATEGORIES)
    if unknown_categories:
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported simulator spending categories: "
                + ", ".join(sorted(unknown_categories))
            ),
        )

    normalised = {}
    for category in SIMULATOR_SPENDING_CATEGORIES:
        amount = float(category_spending.get(category, 0) or 0)

        if not math.isfinite(amount) or amount < 0:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid simulated spending amount for {category}.",
            )

        normalised[category] = amount

    return normalised


@app.get("/simulate/setup")
async def get_simulation_setup(
    user_id: str = Depends(get_current_user_id)
):
    profile_result = (
        supabase_admin.table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )

    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_result.data[0]
    monthly_income = float(profile.get("monthly_income", 0))

    if monthly_income <= 0:
        return {
            "available": False,
            "message": "Add your monthly income before using the simulator.",
            "missing": ["monthly income"],
        }

    today = date.today()
    month_start, month_end = _get_month_bounds(today.month, today.year)

    # Create missing bills for the current month.
    _ensure_bill_occurrences_for_month(user_id, today.month, today.year)

    fin_data = _gather_financial_data(user_id, profile)
    current_result = engine.calculate_score(fin_data)

    expense_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .eq("type", "expense")
        .gte("date", str(month_start))
        .lt("date", str(month_end))
        .execute()
    )
    expenses = expense_result.data or []

    non_bill_expenses = [
        transaction
        for transaction in expenses
        if not transaction.get("is_recurring", False)
    ]

    current_category_spending = _current_category_spending(non_bill_expenses)
    current_total_spending = sum(float(transaction["amount"]) for transaction in expenses)
    current_non_bill_spending = sum(current_category_spending.values())

    bill_result = (
        supabase_admin.table("bills")
        .select("id, name, amount, due_date, status")
        .eq("user_id", user_id)
        .gte("due_date", str(month_start))
        .lt("due_date", str(month_end))
        .order("due_date", desc=False)
        .execute()
    )
    bills = bill_result.data or []

    tracked_bills = [
        {
            "id": bill["id"],
            "name": bill["name"],
            "amount": float(bill["amount"]),
            "due_date": bill["due_date"],
            "status": bill["status"],
        }
        for bill in bills
    ]

    has_tracked_expenses = len(expenses) > 0

    return {
        "available": True,
        "monthly_income": monthly_income,
        "has_tracked_expenses": has_tracked_expenses,
        "current_spending": current_total_spending if has_tracked_expenses else None,
        "current_non_bill_spending": current_non_bill_spending,
        "current_category_spending": current_category_spending,
        "category_multipliers": {
            category: engine.get_category_multiplier(category)
            for category in SIMULATOR_SPENDING_CATEGORIES
        },
        "has_tracked_bills": len(tracked_bills) > 0,
        "tracked_bills": tracked_bills,
        "current_score": current_result.total_score,
        "current_grade": current_result.grade,
    }


@app.post("/simulate", response_model=SimulationResponse)
async def run_simulation(
    data: SimulationRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Calculate a temporary simulated live score.
    Previous months remain in the rolling history. 
    Only the current month's spending and/or current-month bill outcomes are replaced by the scenario.
    Nothing is written back to Tracker records.
    """

    profile_result = (
        supabase_admin.table("profiles")
        .select("*")
        .eq("id", user_id)
        .execute()
    )
    if not profile_result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = profile_result.data[0]
    current_fin_data = _gather_financial_data(user_id, profile)
    # The simulated current month represents the next completed six-month
    # window, so start from the previous five completed calendar months and
    # add the simulated current month as the sixth.
    fin_data = _gather_financial_data(
        user_id,
        profile,
        completed_months=max(1, ROLLING_HISTORY_MONTHS - 1),
    )
    monthly_income = float(profile.get("monthly_income", 0))

    if monthly_income <= 0:
        raise HTTPException(
            status_code=400,
            detail="Simulator unavailable. Add your monthly income first.",
        )

    supplied_spending_inputs = sum([
        data.category_spending is not None,
        data.monthly_spending is not None,
        data.non_bill_spending is not None,
    ])
    if supplied_spending_inputs > 1:
        raise HTTPException(
            status_code=400,
            detail=(
                "Use category spending or one legacy aggregate spending input, "
                "not multiple spending inputs."
            ),
        )

    current_result = engine.calculate_score(current_fin_data)
    sim_data = copy.deepcopy(fin_data)

    today = date.today()
    month_start, month_end = _get_month_bounds(today.month, today.year)
    _ensure_bill_occurrences_for_month(user_id, today.month, today.year)

    expense_result = (
        supabase_admin.table("transactions")
        .select("*")
        .eq("user_id", user_id)
        .eq("type", "expense")
        .gte("date", str(month_start))
        .lt("date", str(month_end))
        .execute()
    )
    current_expenses = expense_result.data or []
    current_non_bill_expenses = [
        transaction
        for transaction in current_expenses
        if not transaction.get("is_recurring", False)
    ]

    current_non_bill_spending = sum(
        float(transaction["amount"]) for transaction in current_non_bill_expenses
    )
    current_total_spending = sum(
        float(transaction["amount"]) for transaction in current_expenses
    )

    current_adjusted_non_bill_spending = sum(
        engine.adjust_spending_amount(
            float(transaction["amount"]),
            transaction.get("category"),
        )
        for transaction in current_non_bill_expenses
    )

    current_adjusted_total_spending = sum(
        engine.adjust_spending_amount(
            float(transaction["amount"]),
            transaction.get("category"),
        )
        for transaction in current_expenses
    )

    # Legacy aggregate Simulator requests still preserve the current category mix.
    non_bill_category_mix_multiplier = (
        current_adjusted_non_bill_spending / current_non_bill_spending
        if current_non_bill_spending > 0
        else 1.0
    )
    overall_category_mix_multiplier = (
        current_adjusted_total_spending / current_total_spending
        if current_total_spending > 0
        else 1.0
    )

    category_spending = _normalise_simulated_category_spending(data.category_spending)
    simulated_category_actual = None
    simulated_category_adjusted = None
    simulated_category_purchase_count = None

    if category_spending is not None:
        simulated_category_actual = sum(category_spending.values())
        simulated_category_adjusted = sum(
            engine.adjust_spending_amount(amount, category)
            for category, amount in category_spending.items()
        )
        simulated_category_purchase_count = len([
            amount for amount in category_spending.values() if amount > 0
        ])

    temporary_bills = data.temporary_bills or []
    has_temporary_bills = data.temporary_bills is not None

    if has_temporary_bills:
        if len(temporary_bills) == 0:
            raise HTTPException(
                status_code=400,
                detail="Add at least one temporary bill to simulate.",
            )

        if len(temporary_bills) > 5:
            raise HTTPException(
                status_code=400,
                detail="You can simulate up to 5 temporary bills.",
            )

    # Simulate existing current-month tracked bills.
    if data.simulated_bills is not None:
        bill_result = (
            supabase_admin.table("bills")
            .select("id, name, amount, status")
            .eq("user_id", user_id)
            .gte("due_date", str(month_start))
            .lt("due_date", str(month_end))
            .execute()
        )
        existing_bills = bill_result.data or []
        if not existing_bills:
            raise HTTPException(
                status_code=400,
                detail="No current-month tracked bills are available for individual simulation.",
            )

        existing_bill_map = {bill["id"]: bill for bill in existing_bills}
        submitted_bill_ids = [bill.bill_id for bill in data.simulated_bills]
        if len(submitted_bill_ids) != len(set(submitted_bill_ids)):
            raise HTTPException(
                status_code=400,
                detail="A simulated bill was submitted more than once.",
            )
        if any(bill_id not in existing_bill_map for bill_id in submitted_bill_ids):
            raise HTTPException(
                status_code=400,
                detail="One or more simulated bills could not be found in the current month.",
            )

        submitted_statuses = {
            simulated_bill.bill_id: simulated_bill.status
            for simulated_bill in data.simulated_bills
        }
        simulated_bill_records = [
            {
                "id": bill["id"],
                "amount": float(bill["amount"]),
                "status": submitted_statuses.get(bill["id"], bill["status"]),
            }
            for bill in existing_bills
        ]

        # fin_data contains only completed historical months; current-month
        # bill outcomes are therefore not part of these historical counts.
        historical_total = fin_data.total_bills
        historical_on_time = fin_data.bills_paid_on_time
        historical_late = fin_data.bills_paid_late
        historical_missed = fin_data.bills_missed

        resolved_bills = [
            bill for bill in simulated_bill_records
            if bill["status"] in ("paid_on_time", "late", "missed")
        ]
        paid_bills = [
            bill for bill in simulated_bill_records
            if bill["status"] in ("paid_on_time", "late")
        ]
        temporary_bill_records = [
            {
                "amount": float(bill.amount),
                "status": bill.status,
            }
            for bill in temporary_bills
        ]
        paid_temporary_bills = [
            bill for bill in temporary_bill_records
            if bill["status"] in ("paid_on_time", "late")
        ]

        simulated_paid_bill_spending = (
            sum(bill["amount"] for bill in paid_bills)
            + sum(bill["amount"] for bill in paid_temporary_bills)
        )

        if category_spending is not None:
            simulated_non_bill_spending = simulated_category_actual
            simulated_adjusted_non_bill_spending = simulated_category_adjusted
            non_bill_purchase_count = simulated_category_purchase_count
        else:
            simulated_non_bill_spending = (
                float(data.non_bill_spending)
                if data.non_bill_spending is not None
                else current_non_bill_spending
            )
            simulated_adjusted_non_bill_spending = (
                simulated_non_bill_spending * non_bill_category_mix_multiplier
            )
            non_bill_purchase_count = (
                1 if data.non_bill_spending is not None
                else len(current_non_bill_expenses)
            )

        total_simulated_spending = (
            simulated_non_bill_spending + simulated_paid_bill_spending
        )
        total_simulated_adjusted_spending = (
            simulated_adjusted_non_bill_spending + simulated_paid_bill_spending
        )

        _replace_current_month_spending_for_simulation(
            sim_data,
            total_simulated_spending,
            len(paid_bills) + len(paid_temporary_bills) + non_bill_purchase_count,
            total_simulated_adjusted_spending,
        )

        sim_data.total_bills = (
            historical_total + len(resolved_bills) + len(temporary_bill_records)
        )
        sim_data.bills_paid_on_time = historical_on_time + len([
            bill for bill in resolved_bills if bill["status"] == "paid_on_time"
        ]) + len([
            bill for bill in temporary_bill_records if bill["status"] == "paid_on_time"
        ])
        sim_data.bills_paid_late = historical_late + len([
            bill for bill in resolved_bills if bill["status"] == "late"
        ]) + len([
            bill for bill in temporary_bill_records if bill["status"] == "late"
        ])
        sim_data.bills_missed = historical_missed + len([
            bill for bill in resolved_bills if bill["status"] == "missed"
        ]) + len([
            bill for bill in temporary_bill_records if bill["status"] == "missed"
        ])

    # Temporary current-month simulated bills when no tracked bills are supplied.
    elif has_temporary_bills:
        paid_temporary_bills = [
            bill for bill in temporary_bills
            if bill.status in ("paid_on_time", "late")
        ]
        simulated_paid_bill_spending = sum(
            float(bill.amount) for bill in paid_temporary_bills
        )

        if category_spending is not None:
            simulated_non_bill_spending = simulated_category_actual
            simulated_adjusted_non_bill_spending = simulated_category_adjusted
            non_bill_purchase_count = simulated_category_purchase_count
        elif data.non_bill_spending is not None:
            simulated_non_bill_spending = float(data.non_bill_spending)
            simulated_adjusted_non_bill_spending = (
                simulated_non_bill_spending * non_bill_category_mix_multiplier
            )
            non_bill_purchase_count = 1
        else:
            raise HTTPException(
                status_code=400,
                detail="Select spending before simulating temporary bills.",
            )

        total_simulated_spending = (
            simulated_non_bill_spending + simulated_paid_bill_spending
        )
        total_simulated_adjusted_spending = (
            simulated_adjusted_non_bill_spending + simulated_paid_bill_spending
        )

        _replace_current_month_spending_for_simulation(
            sim_data,
            total_simulated_spending,
            len(paid_temporary_bills) + non_bill_purchase_count,
            total_simulated_adjusted_spending,
        )

        sim_data.total_bills = fin_data.total_bills + len(temporary_bills)
        sim_data.bills_paid_on_time = fin_data.bills_paid_on_time + len([
            bill for bill in temporary_bills if bill.status == "paid_on_time"
        ])
        sim_data.bills_paid_late = fin_data.bills_paid_late + len([
            bill for bill in temporary_bills if bill.status == "late"
        ])
        sim_data.bills_missed = fin_data.bills_missed + len([
            bill for bill in temporary_bills if bill.status == "missed"
        ])

    # Spending-only simulation.
    else:
        if category_spending is not None:
            _replace_current_month_spending_for_simulation(
                sim_data,
                simulated_category_actual,
                simulated_category_purchase_count,
                simulated_category_adjusted,
            )
        else:
            if data.non_bill_spending is not None:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Non-bill spending is only used with tracked bills or temporary simulated bills."
                    ),
                )

            if data.monthly_spending is not None:
                simulated_current_spending = float(data.monthly_spending)
                simulated_current_adjusted_spending = (
                    simulated_current_spending * overall_category_mix_multiplier
                )

                _replace_current_month_spending_for_simulation(
                    sim_data,
                    simulated_current_spending,
                    1,
                    simulated_current_adjusted_spending,
                )

        # Legacy bill-count simulator fields are retained for backwards compatibility.
        if data.simulated_total_bills is None:
            if data.bills_paid_late != 0 or data.bills_missed != 0:
                raise HTTPException(
                    status_code=400,
                    detail="Select a number of bills before changing payment outcomes.",
                )
        else:
            if data.bills_paid_late + data.bills_missed > data.simulated_total_bills:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Late payments and missed payments cannot exceed the number of simulated bills."
                    ),
                )
            sim_data.total_bills = int(data.simulated_total_bills)
            sim_data.bills_paid_late = int(data.bills_paid_late)
            sim_data.bills_missed = int(data.bills_missed)
            sim_data.bills_paid_on_time = (
                sim_data.total_bills
                - sim_data.bills_paid_late
                - sim_data.bills_missed
            )

    simulated_result = engine.calculate_score(sim_data)
    component_changes = []
    for current_component, simulated_component in zip(
        current_result.components,
        simulated_result.components,
    ):
        component_changes.append({
            "name": current_component.name,
            "current": current_component.score,
            "simulated": simulated_component.score,
            "change": round(simulated_component.score - current_component.score, 1),
        })

    return {
        "current_score": current_result.total_score,
        "simulated_score": simulated_result.total_score,
        "score_change": simulated_result.total_score - current_result.total_score,
        "current_grade": current_result.grade,
        "simulated_grade": simulated_result.grade,
        "component_changes": component_changes,
    }



# Run server
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
