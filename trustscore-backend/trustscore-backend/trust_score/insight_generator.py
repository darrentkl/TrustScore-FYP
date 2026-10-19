import os
import re
from decimal import Decimal, InvalidOperation

from dotenv import load_dotenv


load_dotenv()


class InsightGenerator:
    """
    The Trust Score Engine and Insight Engine produce the facts about the user. The language model is used only to
    turn those facts into a short, personalised credit-focused feedback. 

    The language model does not calculates the Trust Score or behavioural trend
    values by itself. If the API fails or generated text doe not pass validation,
    a deterministic fallback is returned.
    """

    DEFAULT_MODEL = "gpt-6-luna"

    KNOWN_CATEGORIES = {
        "Food & Drinks",
        "Transport",
        "Shopping",
        "Entertainment",
        "Gaming",
        "Fitness",
        "Other",
        "Bills",
    }

    CREDIT_FOCUS_TERMS = {
        "trust score",
        "payment consistency",
        "savings behaviour",
        "spending discipline",
        "simulated credit",
    }

    def __init__(self):
        self.model_name = os.getenv("OPENAI_MODEL", self.DEFAULT_MODEL).strip()
        self.api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self._client = None

    def _get_client(self):
        if not self.api_key:
            raise RuntimeError("OPENAI_API_KEY is not configured.")

        if self._client is None:
            from openai import OpenAI

            self._client = OpenAI(api_key=self.api_key)

        return self._client

    @staticmethod
    def _component_lookup(score_context):
        return {
            component.get("name"): component
            for component in (score_context.get("components") or [])
            if component.get("name")
        }

    @staticmethod
    def _current_top_categories(current_activity):
  
        category_spending = current_activity.get("category_spending_so_far") or {}
        positive = []
        for category, raw_amount in category_spending.items():
            try:
                amount = float(raw_amount)
            except (TypeError, ValueError):
                continue
            if amount > 0:
                positive.append((category, amount))

        if positive:
            max_amount = max(amount for _, amount in positive)
            return [
                {"category": category, "amount": amount}
                for category, amount in positive
                if abs(amount - max_amount) < 0.005
            ]

     
        # Single top category 
        top_current = current_activity.get("top_non_bill_category") or {}
        if top_current.get("category") and top_current.get("amount") is not None:
            try:
                return [{
                    "category": top_current["category"],
                    "amount": float(top_current["amount"]),
                }]
            except (TypeError, ValueError):
                return []

        return []

    @staticmethod
    def _join_categories(categories):
        names = [item["category"] for item in categories if item.get("category")]
        if not names:
            return ""
        if len(names) == 1:
            return names[0]
        if len(names) == 2:
            return f"{names[0]} and {names[1]}"
        return f"{', '.join(names[:-1])}, and {names[-1]}"

    @staticmethod
    def _has_tracked_evidence(name, component, insights, payment_status):
        """
        Distinguish tracked score components from onboarding/neutral estimates.
        Unobserved components have a neutral score of 50. Those numbers are used scoring but they are not evidence of poor behaviour so they must be used to drive personal recommendations.
        """
        if not component or component.get("score") is None:
            return False

        factors = component.get("factors") or {}
        if name == "Payment Consistency":
            if payment_status is not None:
                return payment_status == "tracked_history"
            return factors.get("status") not in {
                "not_applicable", "no_data", "self_reported", "current_month_only"
            }

        if str(factors.get("source", "")).lower().startswith("self-reported"):
            return False
        note = str(factors.get("note", "")).lower()
        if "no income data" in note or "no spending data" in note:
            return False
        if factors.get("score_band") is not None:
            return True

        months = insights.get("months_tracked")
        return months is None or (isinstance(months, (int, float)) and months > 0)

    @classmethod
    def _advice_priority(cls, insights, score_context):
        """
        Pick the most useful evidenced component instead of the lowest score.
        For example, a 10-point improvement in a 40% weighted component has more effect on the simulated Trust Score than the same gain in a 25% weighted component.
        """
        payment_status = (score_context.get("payment") or {}).get("status")
        tracked = []
        for name in ("Payment Consistency", "Savings Behaviour", "Spending Discipline"):
            component = cls._component_lookup(score_context).get(name) or {}
            if cls._has_tracked_evidence(name, component, insights, payment_status):
                score = max(0.0, min(100.0, float(component["score"])))
                weight = float(component.get("weight") or 0.0)
                tracked.append((name, score, weight))

        if not tracked:
            return {"kind": "insufficient", "component": None}

        # Largest potential weighted gain 
        ranked = sorted(
            tracked, key=lambda item: ((100.0 - item[1]) * item[2], item[2]),
            reverse=True,
        )
        name, score, weight = ranked[0]

        # An A grade is represents stron gperformance. But if its historical trend is moving in the wrong direction, frame the recommendation to maintain that strength
        # Otherwise, weaker components still win when their weighted improvement is greater.
        if 85 <= score < 100:
            if (
                name == "Savings Behaviour"
                and (insights.get("savings_trend") or {}).get("direction") == "decreasing"
            ):
                return {"kind": "maintain_savings_trend", "component": name}
            if (
                name == "Spending Discipline"
                and (insights.get("spending_trend") or {}).get("direction") == "increasing"
            ):
                return {"kind": "maintain_spending_trend", "component": name}

            # When every tracked component is strong, give maintenance advice 
            if all(item[1] >= 85 for item in tracked):
                return {"kind": "maintain", "component": name}

        if score < 100:
            return {"kind": "improve", "component": name}

        # No evidenced component has room to improve while recognise strength is used instead of suggesting a stronger score above goes beyond the model max score
        if (
            any(item[0] == "Savings Behaviour" for item in tracked)
            and (insights.get("savings_trend") or {}).get("direction") == "decreasing"
        ):
            return {"kind": "maintain_savings_trend", "component": "Savings Behaviour"}
        if (
            any(item[0] == "Spending Discipline" for item in tracked)
            and (insights.get("spending_trend") or {}).get("direction") == "increasing"
        ):
            return {"kind": "maintain_spending_trend", "component": "Spending Discipline"}
        return {"kind": "maintain", "component": max(tracked, key=lambda item: item[2])[0]}

    @classmethod
    def _fallback_advice(cls, insights, score_context):
        priority = cls._advice_priority(insights, score_context)
        name = priority["component"]
        kind = priority["kind"]
        payment_status = (score_context.get("payment") or {}).get("status")

        if kind == "insufficient":
            components = cls._component_lookup(score_context)
            no_income = any(
                "no income data" in str((components.get(component) or {}).get("factors", {}).get("note", "")).lower()
                for component in ("Savings Behaviour", "Spending Discipline")
            )
            self_reported = payment_status == "self_reported" or any(
                str((components.get(component) or {}).get("factors", {}).get("source", "")).lower().startswith("self-reported")
                for component in ("Savings Behaviour", "Spending Discipline")
            )
            if no_income:
                return (
                    "There is not enough income and completed financial history to identify a reliable improvement area for your simulated Trust Score. "
                    "Enter your monthly income and record expenses so Savings Behaviour and Spending Discipline can be assessed using tracked information."
                )
            if (insights.get("current_month_activity") or {}).get("has_activity"):
                return (
                    "Your current-month financial activity is still in progress and has not yet contributed to your historical simulated Trust Score. "
                    "Keep tracking transactions so your Spending Discipline and Savings Behaviour can be assessed when completed-month data is available."
                )
            if self_reported:
                return (
                    "Your simulated Trust Score currently relies on onboarding estimates rather than sufficient completed financial history. "
                    "Record expenses over time to build evidence for your Savings Behaviour and Spending Discipline instead of treating those estimates as weaknesses."
                )
            return (
                "There is not enough completed financial history to identify a clear strength or weakness in your simulated Trust Score yet. "
                "Keep recording expenses so your Savings Behaviour and Spending Discipline can be evaluated from tracked activity."
            )

        if kind == "maintain_savings_trend":
            return (
                "Your recorded Savings Behaviour is strong, although your savings-rate trend has been decreasing over recent months. "
                "Keep saving consistently to maintain this component of your simulated Trust Score."
            )
        if kind == "maintain_spending_trend":
            return (
                "Your recorded Spending Discipline is strong, although your spending trend has been increasing over recent months. "
                "Keep discretionary spending manageable to maintain this component of your simulated Trust Score."
            )

        if kind == "maintain":
            if name == "Payment Consistency":
                return (
                    "Your tracked bill-payment history shows strong Payment Consistency, supporting your simulated Trust Score. "
                    "Continue paying upcoming bills on time to maintain this component as more completed history is recorded."
                )
            if name == "Savings Behaviour":
                return (
                    "Your recorded savings habits are supporting a strong Savings Behaviour component in your simulated Trust Score. "
                    "Continue saving consistently to maintain this strength as new completed months enter your history."
                )
            return (
                "Your tracked spending habits are supporting a strong Spending Discipline component in your simulated Trust Score. "
                "Continue keeping category-adjusted spending manageable to maintain this component in future completed months."
            )

        if name == "Payment Consistency":
            return (
                "Late or missed payments in your completed bill history are limiting your Payment Consistency component of the simulated Trust Score. "
                "Pay upcoming bills on time to strengthen this component as more resolved payments are recorded."
            )
        if name == "Savings Behaviour":
            return (
                "Your tracked Savings Behaviour has room to improve within the simulated Trust Score model. "
                "Maintain a higher proportion of income as savings over future completed months to strengthen this component."
            )

        fastest = insights.get("fastest_growing_category") or {}
        if fastest.get("category"):
            return (
                f"Your tracked Spending Discipline has room to improve, and {fastest['category']} is a rising spending category in your completed history. "
                "Review discretionary purchases in this category to help keep category-adjusted spending lower and support your simulated Trust Score."
            )
        return (
            "Your recorded Spending Discipline has room to improve in the simulated Trust Score model. "
            "Keep category-adjusted spending within a healthier proportion of income to strengthen this component over future completed months."
        )

    @staticmethod
    def _format_weight(weight):
        if weight is None:
            return None
        return round(float(weight) * 100, 1)

    @classmethod
    def _fact_lines(cls, insights, score_context):
        facts = []

        total_score = score_context.get("total_score")
        overall_grade = score_context.get("grade")
        confidence = score_context.get("confidence")
        payment_context = score_context.get("payment") or {}
        payment_status = payment_context.get("status")

        facts.append(
            "Historical Trust Score and regression trends use the latest six completed calendar months; missing months inside that fixed window are not treated as zero spending."
        )

        if total_score is not None:
            line = f"Simulated Trust Score from completed history: {total_score}/100"
            if overall_grade:
                line += f" ({overall_grade})"
            line += "."
            facts.append(line)

        if confidence:
            facts.append(f"Score reliability: {confidence}.")

        component_lookup = cls._component_lookup(score_context)
        if any(
            not cls._has_tracked_evidence(
                name, component_lookup.get(name) or {}, insights, payment_status
            )
            for name in ("Payment Consistency", "Savings Behaviour", "Spending Discipline")
        ):
            facts.append(
                "The overall simulated Trust Score includes initial neutral or onboarding estimates for components without completed-history evidence; it is not wholly derived from tracked financial behaviour."
            )
        for name in (
            "Payment Consistency",
            "Savings Behaviour",
            "Spending Discipline",
        ):
            component = component_lookup.get(name)
            if not component:
                continue

            if name == "Payment Consistency" and payment_status in {
                "not_applicable",
                "no_data",
                "current_month_only",
            }:
                if payment_status == "not_applicable":
                    facts.append(
                        "Payment Consistency is not applicable for advice because the user reported having no bills. The neutral fallback used in the numerical score must not be treated as a weakness, and the user must not be told to start tracking bills."
                    )
                elif payment_status == "current_month_only":
                    facts.append(
                        "Payment Consistency has no completed-history bill evidence yet. Current-month bill activity may be discussed only as recent activity and the neutral historical fallback must not be treated as weak payment behaviour."
                    )
                else:
                    facts.append(
                        "Payment Consistency has insufficient payment evidence. The neutral fallback must not be treated as weak payment behaviour."
                    )
                continue

            if not cls._has_tracked_evidence(
                name, component, insights, payment_status
            ):
                source = str((component.get("factors") or {}).get("source", ""))
                if source.lower().startswith("self-reported"):
                    facts.append(
                        f"{name} is an onboarding estimate without tracked completed-history evidence; do not describe this estimate as a verified weakness."
                    )
                else:
                    facts.append(
                        f"{name} has insufficient tracked data for personalised advice; its numerical fallback must not be described as weak behaviour."
                    )
                continue

            score = component.get("score")
            weight = cls._format_weight(component.get("weight"))
            grade = component.get("grade")

            parts = []
            if score is not None:
                parts.append(f"{score}/100")
            if weight is not None:
                parts.append(f"weight {weight}%")
            if grade:
                parts.append(f"grade {grade}")

            if parts:
                prefix = name
                if name == "Payment Consistency" and payment_status == "self_reported":
                    prefix += " (self-reported starting estimate)"
                facts.append(f"{prefix}: {', '.join(parts)}.")

            factors = component.get("factors") or {}
            if name == "Savings Behaviour":
                savings_rate = factors.get("savings_rate")
                score_band = factors.get("score_band")
                if savings_rate:
                    facts.append(f"Estimated average savings rate: {savings_rate}.")
                if score_band:
                    facts.append(f"Savings Behaviour band: {score_band}.")

            elif name == "Spending Discipline":
                adjusted_ratio = factors.get("adjusted_spending_ratio")
                score_band = factors.get("score_band")
                if adjusted_ratio:
                    facts.append(
                        f"Category-adjusted spending-to-income ratio: {adjusted_ratio}."
                    )
                if score_band:
                    facts.append(f"Spending Discipline band: {score_band}.")

        total_bills = payment_context.get("total_bills")
        if payment_status == "tracked_history" and total_bills:
            facts.append(
                "Completed-history resolved bills: "
                f"{total_bills} total, "
                f"{payment_context.get('paid_on_time', 0)} paid on time, "
                f"{payment_context.get('late', 0)} late, and "
                f"{payment_context.get('missed', 0)} missed."
            )

        months_tracked = insights.get("months_tracked")
        if months_tracked is not None:
            facts.append(
                f"Completed months with recorded spending inside the six-month window: "
                f"{months_tracked}."
            )

        spending_trend = insights.get("spending_trend") or {}
        direction = spending_trend.get("direction")
        if direction in {"increasing", "decreasing", "stable"}:
            facts.append(f"Completed-month recorded spending trend: {direction}.")

        savings_trend = insights.get("savings_trend") or {}
        direction = savings_trend.get("direction")
        if direction in {"increasing", "decreasing", "stable"}:
            facts.append(f"Completed-month estimated savings-rate trend: {direction}.")

        category_multipliers = score_context.get("category_multipliers") or {}

        fastest = insights.get("fastest_growing_category") or {}
        fastest_category = fastest.get("category")
        if fastest_category:
            facts.append(
                f"Fastest-growing completed-month non-bill spending category: "
                f"{fastest_category}."
            )
            multiplier = category_multipliers.get(fastest_category)
            if multiplier is not None:
                facts.append(
                    f"{fastest_category} multiplier in Spending Discipline: "
                    f"{float(multiplier):.2f}."
                )

        top = insights.get("top_category") or {}
        top_category = top.get("category")
        if top_category:
            share = top.get("share_percent")
            if share is not None:
                facts.append(
                    f"Largest completed-history non-bill category: {top_category} "
                    f"at {share}% of tracked non-bill spending."
                )
            else:
                facts.append(f"Largest completed-history non-bill category: {top_category}.")

        current_activity = insights.get("current_month_activity") or {}
        if current_activity.get("has_activity"):
            label = current_activity.get("label", "Current month")
            facts.append(
                f"{label} is still in progress. Current-month activity is recent context only and has not yet changed the completed-history Trust Score or regression trends."
            )

            total_spending = current_activity.get("total_spending_so_far")
            if total_spending is not None:
                facts.append(
                    f"Recorded spending so far in {label}: ${float(total_spending):.2f}."
                )

            current_top = cls._current_top_categories(current_activity)
            if len(current_top) > 1:
                category_names = cls._join_categories(current_top)
                tied_amount = float(current_top[0]["amount"])
                facts.append(
                    f"Joint-largest non-bill categories so far in {label}: "
                    f"{category_names}, each at ${tied_amount:.2f}."
                )
                facts.append(
                    f"Current-month spending is split between {category_names}; do not describe it as concentrated in only one of these categories."
                )
                for item in current_top:
                    category = item["category"]
                    multiplier = category_multipliers.get(category)
                    if multiplier is not None:
                        facts.append(
                            f"{category} multiplier in Spending Discipline: "
                            f"{float(multiplier):.2f}."
                        )
            elif len(current_top) == 1:
                category = current_top[0]["category"]
                amount = float(current_top[0]["amount"])
                facts.append(
                    f"Largest non-bill category so far in {label}: {category} "
                    f"at ${amount:.2f}."
                )
                multiplier = category_multipliers.get(category)
                if multiplier is not None:
                    facts.append(
                        f"{category} multiplier in Spending Discipline: "
                        f"{float(multiplier):.2f}."
                    )

            current_bills = current_activity.get("bills") or {}
            if current_bills.get("resolved", 0) > 0:
                facts.append(
                    f"Resolved bills so far in {label}: "
                    f"{current_bills.get('resolved', 0)} total, "
                    f"{current_bills.get('paid_on_time', 0)} paid on time, "
                    f"{current_bills.get('late', 0)} late, and "
                    f"{current_bills.get('missed', 0)} missed."
                )
        else:
            facts.append(
                "There is no recorded current-month activity. Do not mention any current-month spending, category, or bill activity."
            )

        return facts

    @staticmethod
    def _clean_text(text):
        if not text:
            return None

        cleaned = " ".join(str(text).split()).strip()
        sentences = re.split(r"(?<=[.!?])\s+", cleaned)
        return " ".join(sentences[:2]).strip()

    @classmethod
    def _unknown_category_added(cls, fact_text, generated_text):
        fact_lower = fact_text.lower()
        generated_lower = generated_text.lower()

        for category in cls.KNOWN_CATEGORIES:
            category_lower = category.lower()
            if category_lower in generated_lower and category_lower not in fact_lower:
                return True

        return False

    @staticmethod
    def _contains_blocked_claim(text):
        blocked = [
            "creditworthy",
            "creditworthiness",
            "financial responsibility",
            "financial stability",
            "default risk",
            "credit risk",
            "credit score",
            "fico",
            "credit bureau",
            "cbs score",
            "loan approval",
            "bank approval",
            "good borrower",
            "bad borrower",
            "guarantee",
            "guaranteed",
            "investment advice",
            "invest in",
            "take a loan",
            "borrow money",
        ]

        lowered = text.lower()
        return any(phrase in lowered for phrase in blocked)

    @staticmethod
    def _contains_counterproductive_action(text):
        """Catch a few clear harmful suggestions; not a substitute for evaluation."""
        lowered = text.lower()
        patterns = (
            r"\b(?:buy|buying|purchase|purchasing)\s+(?:more\s+)?(?:expensive|luxury|unnecessary)\b",
            r"\b(?:spend|spending)\s+(?:more|extra)\s+(?:money\s+)?(?:on\s+)?(?:shopping|games|gaming|luxuries|entertainment|purchases|things|items)\b",
            r"\b(?:miss|skip|delay|postpone)\s+(?:your\s+)?(?:bills?|payments?|repayments?)\b",
            r"\b(?:pay|paying)\s+(?:your\s+)?(?:bills?|payments?)\s+late\b",
        )
        return any(re.search(pattern, lowered) for pattern in patterns)

    @classmethod
    def _is_credit_focused(cls, text):
        lowered = text.lower()
        return any(term in lowered for term in cls.CREDIT_FOCUS_TERMS)

    @staticmethod
    def _contains_unsupported_financial_number(fact_text, generated_text):
        """
        Reject claims not present in verified facts.
        Treat 1.10 versus 1.1 are treated as the same value.
        """

        def normalise_numbers(text):
            values = set()
            for token in re.findall(r"\d+(?:\.\d+)?", text):
                try:
                    values.add(Decimal(token).normalize())
                except InvalidOperation:
                    continue
            return values

        fact_numbers = normalise_numbers(fact_text)
        generated_numbers = normalise_numbers(generated_text)
        return bool(generated_numbers - fact_numbers)

    def generate(self, insights, score_context):
        fallback = self._fallback_advice(insights, score_context)
        facts = self._fact_lines(insights, score_context)

        if not facts:
            return {
                "text": fallback,
                "source": "fallback",
                "model": None,
                "error": "No verified facts were available for generation.",
                "input_tokens": None,
                "output_tokens": None,
            }

        fact_text = " ".join(facts)
        priority = self._advice_priority(insights, score_context)

        # When there is no completed-history evidence, deterministic guidance is used
        if priority["kind"] == "insufficient":
            return {
                "text": fallback,
                "source": "fallback",
                "model": None,
                "error": None,
                "input_tokens": None,
                "output_tokens": None,
            }

        priority_text = (
            f"Recommended topic: {priority['component']}. "
            f"Recommendation type: {priority['kind']}. "
            "Base advice on observed behaviour; do not treat onboarding or neutral fallback scores as evidence of bad habits. "
            "For maintain, maintain_savings_trend, or maintain_spending_trend, acknowledge the selected component's strong performance before discussing a concerning trend. Recommend protecting the current strength, not fixing a weak score. "
            "Only explain a current-month spending category when it directly supports the selected component and the recommendation; category names are normally irrelevant to Payment Consistency or Savings Behaviour."
        )


        instructions = (
            "You are the personalised feedback layer of a university project called Trust Score Engine for Gen Z Credit Simulation. "
            "The application has already calculated every score, weight, payment count, ratio, and behavioural trend. Your job is only to explain those verified facts in natural language. "

            "Generate dynamic, personalised, credit-focused feedback that tells the user which relevant habit they should maintain or improve and how that habit relates to a component of their simulated Trust Score. "
            "Historical scores and trends come from completed months. Current-month facts are recent activity only: if you use them, explicitly frame them as 'so far this month' or as behaviour that can help maintain or improve a future Trust Score when the month becomes part of history. "
            "Never claim that current incomplete-month activity has already changed the historical Trust Score. "

            "If Payment Consistency is marked not applicable, no data, or current-month-only, do not treat its neutral fallback as a weakness and do not tell a user who reports having no bills to start tracking or paying bills. "
            "Choose only the single most useful behaviour for this user to maintain or improve. Use the recommended topic and type supplied after the verified facts as the primary focus, and do not switch to an unverified weakness. "
            "Never advise unnecessary purchases, more discretionary spending, deliberately late or missed payments, or new debt to increase the Trust Score. "

            "Use verified current-month activity only when it adds a meaningful connection to the single chosen Trust Score component. "
            "Do not force a mention of current spending categories merely because the data is available, especially when the recommendation concerns Savings Behaviour or Payment Consistency. "
            "If you do mention incomplete-month activity, describe it as 'so far this month' and do not claim it has already changed the historical Trust Score. "

            "If the chosen component has grade A or a score of at least 85/100, acknowledge the strong performance, and frame an unfavourable trend as a reason to maintain healthy habits rather than implying the current score is poor. "
            "If no verified current-month activity is provided, do not mention 'this month', 'so far this month', or describe any category as current-month activity. "
            "Do not call current spending high, low, excessive, or unusual unless the verified facts include a comparison that supports that wording. "

            "Sentence 2 should give one practical action and explain how it can help maintain or improve the user's simulated Trust Score. "
            "Do not summarise every component or trend. Do not repeat raw scores, percentages, bands, weights, or category multipliers unless a number is essential to understand the recommendation. "
            "Prefer plain-language wording. If Payment Consistency is not applicable, omit it completely from the response. "
            "Do not mention a budget unless a budget value was explicitly provided. "

            "When describing current-month category activity, avoid saying 'all spending is in X'; for a unique largest category, describe it naturally as 'recorded spending is concentrated in X' instead. "
            "If two or more current-month categories are tied for the largest recorded amount, say spending is split between or tied across those categories and never describe one tied category as the sole concentration." 
            "You may prioritise a tied category in the recommendation only when verified multiplier facts support that choice. "

            "Describe historical behaviour in natural user-facing language such as 'over recent months' rather than technical phrases such as 'across completed months', 'across the completed months', or 'across the six completed months'. "

            "Use the exact term 'Trust Score' for the project's simulated score. Never call it a real credit score, never assess real-world creditworthiness, default risk, loan eligibility, or bank approval, and never imply that a lender would make the same decision. "
            "Do not invent causes, numbers, categories, targets, products, or facts. Do not calculate new scores. Use only the verified facts supplied below. Return exactly two short sentences, ideally 35 to 60 words total, with no heading, bullets, disclaimer, or preamble."
        )


        try:
            client = self._get_client()
            response = client.responses.create(
                model=self.model_name,
                reasoning={"effort": "none"},
                instructions=instructions,
                input=(
                    "Verified project facts:\n" + "\n".join(
                        f"- {fact}" for fact in facts
                    ) + "\n\nAdvice selection:\n" + priority_text
                ),
                max_output_tokens=100,
                text={"verbosity": "low"},
                store=False,
            )

            advice = self._clean_text(response.output_text)

            if not advice:
                raise RuntimeError("The model returned no usable advice.")

            if self._contains_counterproductive_action(advice):
                raise RuntimeError(
                    "The model suggested a behaviour that contradicts sound payment or spending habits."
                )

            if self._unknown_category_added(fact_text, advice):
                raise RuntimeError(
                    "The model added an unsupported spending category."
                )

            if self._contains_unsupported_financial_number(fact_text, advice):
                raise RuntimeError(
                    "The model added an unsupported financial number."
                )

            if self._contains_blocked_claim(advice):
                raise RuntimeError(
                    "The model added an unsupported real-world credit or financial claim."
                )

            if not self._is_credit_focused(advice):
                raise RuntimeError(
                    "The model output was not sufficiently focused on the simulated Trust Score."
                )

            usage = getattr(response, "usage", None)
            input_tokens = getattr(usage, "input_tokens", None) if usage else None
            output_tokens = getattr(usage, "output_tokens", None) if usage else None

            return {
                "text": advice,
                "source": "llm",
                "model": self.model_name,
                "error": None,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
            }

        except Exception as exc:
            return {
                "text": fallback,
                "source": "fallback",
                "model": self.model_name,
                "error": str(exc),
                "input_tokens": None,
                "output_tokens": None,
            }
