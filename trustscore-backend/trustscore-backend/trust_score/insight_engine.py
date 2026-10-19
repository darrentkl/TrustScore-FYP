from collections import defaultdict
from datetime import date

# Analayze recent transaction history for behavioural trends
class InsightEngine:

    SPENDING_CATEGORIES = [
        "Food & Drinks",
        "Transport",
        "Shopping",
        "Entertainment",
        "Gaming",
        "Fitness",
        "Other",
    ]

    MIN_TREND_MONTHS = 3

    # A trend is only meaningful when the fitted monthly slope is at least 5% of the series mean
    AMOUNT_TREND_THRESHOLD = 0.05

    # Savings-rate trend uses an absolute threshold of 2 percentage points per month
    SAVINGS_TREND_THRESHOLD = 0.02

    @staticmethod
    def _month_key(value):
        return str(value)[:7]

    @staticmethod
    def _month_ordinal(month_key):
        year, month = [int(part) for part in month_key.split("-")]
        return year * 12 + (month - 1)

    @staticmethod
    def _month_label(month_key):
        year, month = [int(part) for part in month_key.split("-")]
        return date(year, month, 1).strftime("%b %Y")

    @staticmethod
    def _linear_slope(x_values, y_values):
        """Return the ordinary least-squares slope for y against x."""
        if len(x_values) < 2 or len(x_values) != len(y_values):
            return 0.0

        x_mean = sum(x_values) / len(x_values)
        y_mean = sum(y_values) / len(y_values)

        denominator = sum((x - x_mean) ** 2 for x in x_values)
        if denominator == 0:
            return 0.0

        numerator = sum(
            (x - x_mean) * (y - y_mean)
            for x, y in zip(x_values, y_values)
        )
        return numerator / denominator

    @staticmethod
    def _period_comparison(values):
        """
        Compare the first and second half. If there are six tracked month, it becomes the previous three months versus the recent three months.
        """
        if len(values) < 2:
            return {
                "previous_average": None,
                "recent_average": None,
                "change_percent": None,
            }

        split = len(values) // 2
        previous = values[:split]
        recent = values[split:]

        previous_average = sum(previous) / len(previous)
        recent_average = sum(recent) / len(recent)

        change_percent = None
        if previous_average > 0:
            change_percent = (
                (recent_average - previous_average) / previous_average
            ) * 100

        return {
            "previous_average": round(previous_average, 2),
            "recent_average": round(recent_average, 2),
            "change_percent": (
                round(change_percent, 1)
                if change_percent is not None
                else None
            ),
        }

    def _amount_trend(self, month_keys, values):
        if len(values) < self.MIN_TREND_MONTHS:
            comparison = self._period_comparison(values)
            return {
                "direction": "insufficient_data",
                "months_used": len(values),
                "slope_per_month": None,
                "normalized_slope_percent": None,
                **comparison,
            }

        first_ordinal = self._month_ordinal(month_keys[0])
        x_values = [
            self._month_ordinal(month_key) - first_ordinal
            for month_key in month_keys
        ]

        slope = self._linear_slope(x_values, values)
        mean_value = sum(values) / len(values)

        normalized_slope = (
            slope / mean_value
            if mean_value > 0
            else 0.0
        )

        if normalized_slope >= self.AMOUNT_TREND_THRESHOLD:
            direction = "increasing"
        elif normalized_slope <= -self.AMOUNT_TREND_THRESHOLD:
            direction = "decreasing"
        else:
            direction = "stable"

        comparison = self._period_comparison(values)

        return {
            "direction": direction,
            "months_used": len(values),
            "slope_per_month": round(slope, 2),
            "normalized_slope_percent": round(normalized_slope * 100, 1),
            **comparison,
        }

    def _savings_trend(self, month_keys, savings_rates):
        if len(savings_rates) < self.MIN_TREND_MONTHS:
            comparison = self._period_comparison(savings_rates)
            return {
                "direction": "insufficient_data",
                "months_used": len(savings_rates),
                "slope_percentage_points_per_month": None,
                "previous_average_percent": (
                    round(comparison["previous_average"] * 100, 1)
                    if comparison["previous_average"] is not None
                    else None
                ),
                "recent_average_percent": (
                    round(comparison["recent_average"] * 100, 1)
                    if comparison["recent_average"] is not None
                    else None
                ),
            }

        first_ordinal = self._month_ordinal(month_keys[0])
        x_values = [
            self._month_ordinal(month_key) - first_ordinal
            for month_key in month_keys
        ]

        slope = self._linear_slope(x_values, savings_rates)

        if slope >= self.SAVINGS_TREND_THRESHOLD:
            direction = "increasing"
        elif slope <= -self.SAVINGS_TREND_THRESHOLD:
            direction = "decreasing"
        else:
            direction = "stable"

        comparison = self._period_comparison(savings_rates)

        return {
            "direction": direction,
            "months_used": len(savings_rates),
            "slope_percentage_points_per_month": round(slope * 100, 1),
            "previous_average_percent": (
                round(comparison["previous_average"] * 100, 1)
                if comparison["previous_average"] is not None
                else None
            ),
            "recent_average_percent": (
                round(comparison["recent_average"] * 100, 1)
                if comparison["recent_average"] is not None
                else None
            ),
        }

    def analyse(self, transactions, monthly_income):
        """
        Build behavioural insights from expense transactions. Excludes months with no recorded transactions (not treated as zero spending)
        """
        expense_transactions = [
            transaction
            for transaction in (transactions or [])
            if transaction.get("type") == "expense"
        ]

        if not expense_transactions:
            return {
                "available": False,
                "message": (
                    "Not enough tracked history yet. Keep logging expenses to unlock behavioural insights"
                ),
                "months_tracked": 0,
                "minimum_months_for_trend": self.MIN_TREND_MONTHS,
                "monthly_history": [],
                "top_category": None,
                "spending_trend": {
                    "direction": "insufficient_data",
                    "months_used": 0,
                },
                "savings_trend": {
                    "direction": "insufficient_data",
                    "months_used": 0,
                },
                "category_trends": [],
                "observations": [],
            }

        monthly_totals = defaultdict(float)
        monthly_category_totals = defaultdict(lambda: defaultdict(float))

        for transaction in expense_transactions:
            month_key = self._month_key(transaction.get("date"))
            amount = float(transaction.get("amount", 0) or 0)
            category = transaction.get("category")

            monthly_totals[month_key] += amount

            if (
                not transaction.get("is_recurring", False)
                and category in self.SPENDING_CATEGORIES
            ):
                monthly_category_totals[month_key][category] += amount

        active_months = sorted(monthly_totals.keys())
        monthly_history = []

        for month_key in active_months:
            total_spending = monthly_totals[month_key]

            savings_rate = None
            if monthly_income and monthly_income > 0:
                savings = max(0.0, float(monthly_income) - total_spending)
                savings_rate = savings / float(monthly_income)

            monthly_history.append({
                "month_key": month_key,
                "label": self._month_label(month_key),
                "total_spending": round(total_spending, 2),
                "savings_rate_percent": (
                    round(savings_rate * 100, 1)
                    if savings_rate is not None
                    else None
                ),
                "categories": {
                    category: round(
                        monthly_category_totals[month_key].get(category, 0.0),
                        2,
                    )
                    for category in self.SPENDING_CATEGORIES
                },
            })

        spending_values = [
            monthly_totals[month_key]
            for month_key in active_months
        ]
        spending_trend = self._amount_trend(
            active_months,
            spending_values,
        )

        savings_rates = []
        if monthly_income and monthly_income > 0:
            savings_rates = [
                max(
                    0.0,
                    float(monthly_income) - monthly_totals[month_key],
                ) / float(monthly_income)
                for month_key in active_months
            ]

        savings_trend = (
            self._savings_trend(active_months, savings_rates)
            if savings_rates
            else {
                "direction": "unavailable",
                "months_used": len(active_months),
                "message": "Monthly income is required for savings insights.",
            }
        )

        category_totals = {
            category: sum(
                monthly_category_totals[month_key].get(category, 0.0)
                for month_key in active_months
            )
            for category in self.SPENDING_CATEGORIES
        }

        total_non_bill_spending = sum(category_totals.values())
        top_category = None

        if total_non_bill_spending > 0:
            top_name = max(category_totals, key=category_totals.get)
            top_amount = category_totals[top_name]
            top_category = {
                "category": top_name,
                "total_spent": round(top_amount, 2),
                "share_percent": round(
                    (top_amount / total_non_bill_spending) * 100,
                    1,
                ),
            }

        category_trends = []
        for category in self.SPENDING_CATEGORIES:
            values = [
                monthly_category_totals[month_key].get(category, 0.0)
                for month_key in active_months
            ]

            if sum(values) <= 0:
                continue

            trend = self._amount_trend(active_months, values)
            category_trends.append({
                "category": category,
                "total_spent": round(sum(values), 2),
                **trend,
            })

        category_trends.sort(
            key=lambda item: item["total_spent"],
            reverse=True,
        )

        increasing_categories = [
            item
            for item in category_trends
            if item.get("direction") == "increasing"
        ]

        fastest_growing_category = None
        if increasing_categories:
            fastest_growing_category = max(
                increasing_categories,
                key=lambda item: item.get(
                    "normalized_slope_percent",
                    0,
                ),
            )

        observations = []

        if len(active_months) < self.MIN_TREND_MONTHS:
            observations.append(
                f"You currently have {len(active_months)} tracked month"
                f"{'s' if len(active_months) != 1 else ''}. "
                f"At least {self.MIN_TREND_MONTHS} tracked months are needed before trend directions are shown."
            )
        else:
            if spending_trend["direction"] == "increasing":
                observations.append(
                    "Your total recorded spending shows an increasing trend across the tracked months."
                )
            elif spending_trend["direction"] == "decreasing":
                observations.append(
                    "Your total recorded spending shows a decreasing trend across the tracked months."
                )
            else:
                observations.append(
                    "Your total recorded spending is relatively stable across the tracked months."
                )

            if fastest_growing_category:
                observations.append(
                    f"{fastest_growing_category['category']} is the fastest-growing tracked spending category."
                )

            if savings_trend["direction"] == "decreasing":
                observations.append(
                    "Your estimated savings rate shows a decreasing trend."
                )
            elif savings_trend["direction"] == "increasing":
                observations.append(
                    "Your estimated savings rate shows an increasing trend."
                )

        if top_category:
            observations.append(
                f"{top_category['category']} is your largest tracked "
                f"non-bill category at {top_category['share_percent']}% of non-bill spending in this period."
            )

        return {
            "available": len(active_months) >= self.MIN_TREND_MONTHS,
            "message": (
                "Behavioural trend insights are available."
                if len(active_months) >= self.MIN_TREND_MONTHS
                else (
                    "More tracked history is needed before trend directions can be calculated."
                )
            ),
            "months_tracked": len(active_months),
            "minimum_months_for_trend": self.MIN_TREND_MONTHS,
            "monthly_history": monthly_history,
            "top_category": top_category,
            "fastest_growing_category": fastest_growing_category,
            "spending_trend": spending_trend,
            "savings_trend": savings_trend,
            "category_trends": category_trends,
            "observations": observations,
        }
