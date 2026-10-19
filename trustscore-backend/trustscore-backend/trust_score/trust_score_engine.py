from datetime import datetime
from dataclasses import dataclass, field


@dataclass
class FinancialData:
    # Payment data
    total_bills: int = 0
    bills_paid_on_time: int = 0
    bills_paid_late: int = 0
    bills_missed: int = 0

    # Spending data
    monthly_spending: float = 0.0
    adjusted_monthly_spending: float = 0.0
    monthly_income: float = 0.0
    total_purchases_count: int = 0
    manual_purchases_count: int = 0

    # Onboarding baselines
    baseline_payment: float = -1
    baseline_spending: float = -1
    baseline_savings: float = -1
    payment_not_applicable: bool = False

    # Rolling history data
    uses_rolling_history: bool = False
    spending_month_count: int = 0
    spending_months: list = field(default_factory=list)
    current_month_purchase_count: int = 0

@dataclass
class ComponentScore:
    name: str
    score: float
    weight: float
    weighted_score: float
    grade: str
    feedback: str
    factors: dict

@dataclass
class TrustScoreResult:
    total_score: int
    grade: str
    components: list
    summary: str
    confidence: str
    confidence_message: str
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().isoformat()


# Trust Score calculation
class TrustScoreEngine:

    WEIGHTS = {
        "payment_consistency": 0.40,
        "spending_discipline": 0.25,
        "savings_behaviour": 0.35,
    }

    # Category multipliers used only by Spending Discipline.
    CATEGORY_MULTIPLIERS = {
        "Food & Drinks": 1.00,
        "Transport": 0.90,
        "Shopping": 1.05,
        "Entertainment": 1.10,
        "Gaming": 1.10,
        "Fitness": 1.00,
        "Other": 1.00,
        "Bills": 1.00,
    }

    @classmethod
    def get_category_multiplier(cls, category):
        """Return the configured multiplier, default unknown categories to neutral."""
        return float(cls.CATEGORY_MULTIPLIERS.get(category, 1.00))

    @classmethod
    def adjust_spending_amount(cls, amount, category):
        """Apply the category multiplier to one spending amount."""
        return float(amount) * cls.get_category_multiplier(category)


    def calculate_score(self, data):
        components = [
            self._score_payment_consistency(data),
            self._score_spending_discipline(data),
            self._score_savings_behaviour(data),
        ]
        total_100 = sum(c.weighted_score for c in components)
        total_score = int(total_100 + 0.5)
        grade = self._get_overall_grade(total_score)
        confidence, confidence_message = self._calculate_confidence(data)
        summary = self._generate_summary(total_score, grade, components)
        return TrustScoreResult(
            total_score=total_score,
            grade=grade,
            components=components,
            summary=summary,
            confidence=confidence,
            confidence_message=confidence_message,
        )

    # Payment consistency score
    # Calculate payment score using tracked bills or onboarding baseline
    def _score_payment_consistency(self, data):

        weight = self.WEIGHTS["payment_consistency"]

        PAID_ON_TIME_POINTS = 100
        PAID_LATE_POINTS = 50
        MISSED_POINTS = 0

        if data.total_bills > 0:
            total_payment_points = (
                data.bills_paid_on_time * PAID_ON_TIME_POINTS
                + data.bills_paid_late * PAID_LATE_POINTS
                + data.bills_missed * MISSED_POINTS
            )

            score = total_payment_points / data.total_bills
            score = max(0, min(100, score))

            factors = {
                "paid_on_time_points": PAID_ON_TIME_POINTS,
                "paid_late_points": PAID_LATE_POINTS,
                "missed_points": MISSED_POINTS,
                "bills_on_time": data.bills_paid_on_time,
                "bills_late": data.bills_paid_late,
                "bills_missed": data.bills_missed,
                "total_bills": data.total_bills,
                "total_payment_points": total_payment_points,
                "payment_score": round(score, 1),
                "uses_rolling_history": data.uses_rolling_history,
            }

            # Personalised payment feedback
            bill_word = "bill" if data.total_bills == 1 else "bills"

            payment_description = (
                f"Across {data.total_bills} recorded {bill_word}, "
                f"{data.bills_paid_on_time} paid on time, "
                f"{data.bills_paid_late} paid late, and "
                f"{data.bills_missed} missed."
            )

            if score >= 100:
                feedback = (
                    f"{payment_description}\n\n"
                    "You are already at the highest Payment Consistency score of 100. "
                    "Keep paying upcoming bills on time to maintain it."
                )

            else:
                projected_score = (
                    total_payment_points + PAID_ON_TIME_POINTS
                ) / (data.total_bills + 1)

                projected_score = round(
                    max(0, min(100, projected_score)),
                    1
                )

                if data.bills_missed > 0:
                    payment_action = (
                        "Missed payments have the strongest impact on this component. "
                        "Focus on paying upcoming bills on time."
                    )

                elif data.bills_paid_late > 0:
                    payment_action = (
                        "Late payments are lowering this component. "
                        "Focus on paying upcoming bills on time."
                    )

                else:
                    payment_action = (
                        "Continue paying upcoming bills on time."
                    )

                feedback = (
                    f"{payment_description}\n\n"
                    f"{payment_action}\n\n"
                    f"If your next bill is paid on time, your Payment Consistency "
                    f"score would increase from {round(score, 1)} "
                    f"to about {projected_score}."
                )

        elif data.payment_not_applicable:
            # If the user  do not have bills. Use neutral fallback of 50 and do not interpret it as poor payment behaviour.
            score = 50.0

            factors = {
                "status": "not_applicable",
                "note": (
                    "The user reported having no bills. A neutral fallback is used for the numerical Trust Score and should not be interpreted as weak payment behaviour."
                ),
            }

            feedback = (
                "You reported that you do not currently have bills, so Payment Consistency is not being assessed from payment behaviour. "
                "The neutral value used in the Trust Score should not be read as a poor payment habit."
            )

        elif data.baseline_payment >= 0:
            score = data.baseline_payment

            factors = {
                "source": "Self-reported (onboarding)",
                "status": "self_reported",
                "note": (
                    "Add bills in Tracker and update their payment status to get a tracked score."
                ),
            }

            feedback = (
                "This score is based on your onboarding response. Track bill payments to build a score based on real data. This component is worth 40% of your total score."
            )

        else:
            score = 50.0

            factors = {
                "status": "no_data",
                "note": "No payment data yet",
            }

            feedback = (
                "There is not enough payment information to assess this component from tracked behaviour yet."
            )

        return ComponentScore(
            name="Payment Consistency",
            score=round(score, 1),
            weight=weight,
            weighted_score=round(score * weight, 2),
            grade=self._get_component_grade(score),
            feedback=feedback,
            factors=factors,
        )


    # Spending discipline score
    # Calculate spending score using spending to income ratio
    def _score_spending_discipline(self, data):

        weight = self.WEIGHTS["spending_discipline"]

        if data.monthly_income == 0:
            score = 50.0
            factors = {"note": "No income data provided"}
            feedback = "Enter your monthly income to calculate your Spending Discipline score."

        elif data.monthly_spending > 0 or data.total_purchases_count > 0:

            # Spending Discipline uses category-adjusted spending.
            # Fall back to actual spending for older/neutral data that has no adjusted value.
            adjusted_spending = float(data.adjusted_monthly_spending)
            if adjusted_spending <= 0 and data.monthly_spending > 0:
                adjusted_spending = float(data.monthly_spending)

            spending_ratio = adjusted_spending / data.monthly_income

            if spending_ratio >= 1.00:
                score = 0
                score_band = "100% and above adjusted spending ratio"
            elif spending_ratio <= 0.50:
                score = 100
                score_band = "0%-50% adjusted spending ratio"
            elif spending_ratio <= 0.60:
                score = 85
                score_band = "50%-60% adjusted spending ratio"
            elif spending_ratio <= 0.70:
                score = 70
                score_band = "60%-70% adjusted spending ratio"
            elif spending_ratio <= 0.80:
                score = 50
                score_band = "70%-80% adjusted spending ratio"
            elif spending_ratio <= 0.90:
                score = 30
                score_band = "80%-90% adjusted spending ratio"
            else:
                score = 10
                score_band = "90%-99% adjusted spending ratio"

            scoring_guide = [
                {"label": "0%-50% adjusted spending ratio", "points": "100 pts"},
                {"label": "50%-60% adjusted spending ratio", "points": "85 pts"},
                {"label": "60%-70% adjusted spending ratio", "points": "70 pts"},
                {"label": "70%-80% adjusted spending ratio", "points": "50 pts"},
                {"label": "80%-90% adjusted spending ratio", "points": "30 pts"},
                {"label": "90%-99% adjusted spending ratio", "points": "10 pts"},
                {"label": "100% and above adjusted spending ratio", "points": "0 pts"},
            ]

            score = max(0, min(100, score))

            factors = {
                # Keep spending_ratio for frontend compatibility.
                "spending_ratio": f"{round(spending_ratio * 100, 1)}%",
                "adjusted_spending_ratio": f"{round(spending_ratio * 100, 1)}%",
                "score_band": score_band,
                "scoring_guide": scoring_guide,
                "monthly_spending": f"${data.monthly_spending:,.2f}",
                "adjusted_monthly_spending": f"${adjusted_spending:,.2f}",
                "monthly_income": f"${data.monthly_income:,.2f}",
                "category_multipliers": dict(self.CATEGORY_MULTIPLIERS),
                "uses_rolling_history": data.uses_rolling_history,
            }

            spending_percent = round(spending_ratio * 100, 1)

            if data.spending_month_count > 1:
                spending_description = (
                    f"Across {data.spending_month_count} tracked months, your actual average "
                    f"monthly spending is ${data.monthly_spending:,.2f}. After category "
                    f"adjustment it is ${adjusted_spending:,.2f}, giving an adjusted "
                    f"spending-to-income ratio of {spending_percent}%."
                )
            else:
                spending_description = (
                    f"Your actual tracked spending is ${data.monthly_spending:,.2f}. "
                    f"After category adjustment it is ${adjusted_spending:,.2f}, giving "
                    f"an adjusted spending-to-income ratio of {spending_percent}%."
                )

            if spending_ratio <= 0.50:
                feedback = (
                    f"{spending_description}\n\n"
                    "You are already in the highest Spending Discipline band. "
                    "Keep your category-adjusted spending at 50% or below to maintain a score of 100."
                )

            else:
                if spending_ratio <= 0.60:
                    target_ratio = 0.50
                    next_score = 100
                elif spending_ratio <= 0.70:
                    target_ratio = 0.60
                    next_score = 85
                elif spending_ratio <= 0.80:
                    target_ratio = 0.70
                    next_score = 70
                elif spending_ratio <= 0.90:
                    target_ratio = 0.80
                    next_score = 50
                elif spending_ratio < 1.00:
                    target_ratio = 0.90
                    next_score = 30
                else:
                    target_ratio = None
                    next_score = 10

                if target_ratio is not None:
                    target_adjusted_spending = data.monthly_income * target_ratio
                    adjusted_amount_to_reduce = max(
                        0,
                        adjusted_spending - target_adjusted_spending
                    )
                    target_percent = int(target_ratio * 100)

                    feedback = (
                        f"{spending_description}\n\n"
                        f"Next target: an adjusted spending ratio of {target_percent}% or less "
                        f"(${target_adjusted_spending:,.2f}).\n\n"
                        f"Reducing your category-adjusted spending by about "
                        f"${adjusted_amount_to_reduce:,.2f} would move your Spending Discipline "
                        f"score from {score} to {next_score}."
                    )

                else:
                    adjusted_amount_over_income = max(
                        0,
                        adjusted_spending - data.monthly_income
                    )

                    feedback = (
                        f"{spending_description}\n\n"
                        f"Your first target is to bring category-adjusted spending below "
                        f"${data.monthly_income:,.2f} per month.\n\n"
                        f"It is currently about ${adjusted_amount_over_income:,.2f} above that "
                        f"amount. Moving below 100% of your income or allowance would move "
                        f"your Spending Discipline out of the lowest scoring band."
                    )

        elif data.baseline_spending >= 0:
            # Use onboarding baseline (no tracked data)
            score = data.baseline_spending
            factors = {
                "source": "Self-reported (onboarding)",
                "note": "Log expenses to get a tracked score",
            }
            feedback = (
                "This score is based on your onboarding response. Log expenses in the Tracker to get a score based on actual spending and spending categories."
            )

        else:
            score = 50.0
            factors = {"note": "No spending data yet"}
            feedback = "Start logging expenses to calculate your Spending Discipline score."

        return ComponentScore(
            name="Spending Discipline",
            score=round(score, 1),
            weight=weight,
            weighted_score=round(score * weight, 2),
            grade=self._get_component_grade(score),
            feedback=feedback,
            factors=factors,
        )


    # Savings behaviour score
    # Calculate savings score from income and spending
    def _score_savings_behaviour(self, data):

        weight = self.WEIGHTS["savings_behaviour"]

        if data.monthly_income == 0:
            score = 50.0
            factors = {"note": "No income data provided"}
            feedback = "Enter your monthly income to calculate your Savings Behaviour score."
        elif data.monthly_spending > 0 or data.total_purchases_count > 0:
            # Use tracked spending
            savings = max(0, data.monthly_income - data.monthly_spending)
            savings_rate = savings / data.monthly_income

            if savings_rate >= 0.40:
                score = 100
                score_band = "40% and above savings rate"
            elif savings_rate >= 0.30:
                score = 85
                score_band = "30%-40% savings rate"
            elif savings_rate >= 0.20:
                score = 70
                score_band = "20%-30% savings rate"
            elif savings_rate >= 0.15:
                score = 50
                score_band = "15%-20% savings rate"
            elif savings_rate >= 0.10:
                score = 30
                score_band = "10%-15% savings rate"
            elif savings_rate > 0:
                score = 10
                score_band = "0%-10% savings rate"
            else:
                score = 0
                score_band = "0% and below savings rate"

            scoring_guide = [
            {"label": "40% and above savings rate", "points": "100 pts"},
            {"label": "30%-40% savings rate", "points": "85 pts"},
            {"label": "20%-30% savings rate", "points": "70 pts"},
            {"label": "15%-20% savings rate", "points": "50 pts"},
            {"label": "10%-15% savings rate", "points": "30 pts"},
            {"label": "0%-10% savings rate", "points": "10 pts"},
            {"label": "0% and below savings rate", "points": "0 pts"},
            ]

            score = max(0, min(100, score))

            factors = {
                "savings_rate": f"{round(savings_rate * 100, 1)}%",
                "score_band": score_band,
                "scoring_guide": scoring_guide,
                "monthly_savings": f"${savings:,.2f}",
                "monthly_income": f"${data.monthly_income:,.2f}",
                "monthly_spending": f"${data.monthly_spending:,.2f}",
                "uses_rolling_history": data.uses_rolling_history,

                #"history_window_months": data.history_window_months,
                #"history_period": data.history_period_label,
                #"months_used": data.spending_month_count,
                #"monthly_breakdown": data.spending_months,
            }
            savings_percent = round(savings_rate * 100, 1)

            if data.spending_month_count > 1:
                savings_description = (
                    f"Across {data.spending_month_count} tracked months, your estimated "
                    f"average monthly savings are ${savings:,.2f} out of "
                    f"${data.monthly_income:,.2f} ({savings_percent}%)."
                )
                savings_action_text = "average monthly savings"
            else:
                savings_description = (
                    f"Your estimated savings are ${savings:,.2f} out of "
                    f"${data.monthly_income:,.2f} ({savings_percent}%)."
                )
                savings_action_text = "savings"


            if savings_rate >= 0.40:
                feedback = (
                    f"{savings_description}\n\n"
                    "You are already in the highest Savings Behaviour band. "
                    "Keep saving at least 40% of your income or allowance "
                    "to maintain a score of 100."
                )

            else:
                if savings_rate >= 0.30:
                    target_ratio = 0.40
                    next_score = 100

                elif savings_rate >= 0.20:
                    target_ratio = 0.30
                    next_score = 85

                elif savings_rate >= 0.15:
                    target_ratio = 0.20
                    next_score = 70

                elif savings_rate >= 0.10:
                    target_ratio = 0.15
                    next_score = 50

                elif savings_rate > 0:
                    target_ratio = 0.10
                    next_score = 30

                else:
                    target_ratio = None
                    next_score = 10


                if target_ratio is not None:
                    target_savings = data.monthly_income * target_ratio

                    amount_to_increase = max(
                        0,
                        target_savings - savings
                    )

                    target_percent = int(target_ratio * 100)

                    feedback = (
                        f"{savings_description}\n\n"
                        f"Next target: {target_percent}% "
                        f"(${target_savings:,.2f}).\n\n"
                        f"Increasing your {savings_action_text} by about "
                        f"${amount_to_increase:,.2f} would move your Savings Behaviour "
                        f"score from {score} to {next_score}."
                    )

                else:
                    feedback = (
                        f"{savings_description}\n\n"
                        "You currently have no estimated savings.\n\n"
                        "Saving any positive amount would move your Savings Behaviour "
                        f"score from {score} to {next_score}."
                    )
        elif data.baseline_savings >= 0:
            # Use onboarding baseline when there is no tracked data
            score = data.baseline_savings
            factors = {"source": "Self-reported (onboarding)", "note": "Log expenses to calculate actual savings rate"}
            feedback = "This score is based on your onboarding response. As you log expenses, your actual savings rate will be calculated."
        else:
            score = 50.0
            factors = {"note": "No savings data yet"}
            feedback = "Start logging expenses to calculate your savings rate."

        return ComponentScore(name="Savings Behaviour", score=round(score, 1), weight=weight,
            weighted_score=round(score * weight, 2), grade=self._get_component_grade(score),
            feedback=feedback, factors=factors)


    # Score reliability
    # Estimate score reliability based on the number of tracked data
    def _calculate_confidence(self, data):

        tracked_count = data.manual_purchases_count + data.total_bills
        activity_label = (
            "logged expenses"
            if data.payment_not_applicable
            else "logged expenses and bills"
        )

        if tracked_count >= 15:
            return (
                "High",
                f"Your score is based on many {activity_label}. This gives a reliable picture of your financial habits. Keep it up!"
            )
        elif tracked_count >= 5:
            return (
                "Medium",
                f"Your score is based on several {activity_label}. Continue tracking to make it more reliable."
            )
        elif tracked_count >= 1:
            return (
                "Low",
                f"Your score is based on a few {activity_label}. Continue tracking to make it more reliable."
            )
        else:
            if data.payment_not_applicable:
                message = (
                    "Your score is currently based mainly on your onboarding answers. "
                    "Start logging expenses to make it more reliable."
                )
            else:
                message = (
                    "Your score is currently based on your onboarding answers. "
                    "Start logging expenses and bills to make it more reliable."
                )
            return ("Very Low", message)
    

    @staticmethod
    def _get_component_grade(score):
        if score >= 85:
            return "A"
        if score >= 70:
            return "B"
        if score >= 60:
            return "C"
        if score >= 50:
            return "D"
        return "F"

    @staticmethod
    def _get_overall_grade(score):
        if score >= 85:
            return "Excellent"
        if score >= 70:
            return "Good"
        if score >= 60:
            return "Fair"
        if score >= 50:
            return "Needs Improvement"
        return "Poor"

    @staticmethod
    def _generate_summary(score, grade, components):
        advice_components = [
            component
            for component in components
            if (component.factors or {}).get("status")
            not in {"not_applicable", "no_data"}
        ]

        if not advice_components:
            return (
                f"Your TrustScore is {score} ({grade}). More tracked data is "
                "needed before identifying a strongest area or improvement priority."
            )

        sorted_comps = sorted(
            advice_components,
            key=lambda c: c.score,
            reverse=True,
        )
        strongest = sorted_comps[0]
        weakest = sorted_comps[-1]
        return (f"Your TrustScore is {score} ({grade}). "
                f"Your strongest area is {strongest.name} ({strongest.score}/100, grade {strongest.grade}). "
                f"Your biggest opportunity for improvement is {weakest.name} ({weakest.score}/100, grade {weakest.grade}). "
                f"{weakest.feedback}")




