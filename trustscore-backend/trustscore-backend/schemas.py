from pydantic import BaseModel, Field
from typing import Optional
#from datetime import date, datetime


# Auth
class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)
    name: str
    age: int = Field(ge=1, le=100)


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = Field(None, ge=1, le=100)
    employment_status: Optional[str] = None
    monthly_income: Optional[float] = Field(None, ge=0)
    onboarding_completed: Optional[bool] = None
    baseline_payment: Optional[float] = None
    baseline_spending: Optional[float] = None
    baseline_savings: Optional[float] = None


class ProfileResponse(BaseModel):
    id: str
    name: str
    age: Optional[int] = None
    employment_status: Optional[str] = None
    monthly_income: float = 0
    onboarding_completed: bool = False
    created_at: Optional[str] = None


# Transactions
class TransactionCreate(BaseModel):
    name: str
    amount: float = Field(gt=0)
    category: str
    type: str = Field(pattern="^(income|expense)$")
    is_recurring: bool = False
    date: Optional[str] = None


class TransactionResponse(BaseModel):
    id: str
    name: str
    amount: float
    category: str
    type: str
    is_recurring: bool
    date: str
    created_at: Optional[str] = None


# Bills
class BillCreate(BaseModel):
    name: str
    amount: float = Field(ge=0)
    due_date: str
    status: str = Field(
        default="upcoming",
        pattern="^(paid_on_time|late|missed|upcoming)$"
    )


class BillUpdate(BaseModel):
    """Data for updating a bill's status."""
    status: str = Field(pattern="^(paid_on_time|late|missed|upcoming)$")


class BillResponse(BaseModel):
    id: str
    name: str
    amount: float
    due_date: str
    status: str
    created_at: Optional[str] = None


# Simulator
class SimulatedBillStatus(BaseModel):
    bill_id: str
    status: str = Field(
        pattern="^(paid_on_time|late|missed|upcoming)$"
    )


class TemporarySimulatedBill(BaseModel):
    amount: float = Field(gt=0)
    status: str = Field(
        pattern="^(paid_on_time|late|missed)$"
    )


class SimulationRequest(BaseModel):
    # Spending values used in simulator
    # category_spending is the current Version 1 input used by the category sliders.
    # The older aggregate fields are retained for backwards compatibility while testing.
    category_spending: Optional[dict[str, float]] = None
    monthly_spending: Optional[float] = Field(default=None, ge=0)
    non_bill_spending: Optional[float] = Field(default=None, ge=0)

    # Existing and temporary bills used in simulator
    simulated_bills: Optional[list[SimulatedBillStatus]] = None 
    temporary_bills: Optional[list[TemporarySimulatedBill]] = None

    # Bill count used in simulator
    simulated_total_bills: Optional[int] = Field(default=None, ge=1)
    bills_paid_late: int = Field(default=0, ge=0)
    bills_missed: int = Field(default=0, ge=0)


class SimulationResponse(BaseModel):
    current_score: int
    simulated_score: int
    score_change: int
    current_grade: str
    simulated_grade: str
    component_changes: list[dict]


