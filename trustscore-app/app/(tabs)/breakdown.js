// Trust Score breakdown screen

import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  Alert,
} from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";
import { getScore } from "../../services/api";

export default function BreakdownScreen() {
  const isFocused = useIsFocused();

  const [score, setScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [showCalculation, setShowCalculation] = useState(false);

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  async function loadData() {
    try {
      const scoreData = await getScore();
      setScore(scoreData);
    } catch (error) {
      console.error("Failed to load breakdown data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function getComponentColor(component) {
    switch (component.grade) {
      case "A":
        return COLORS.componentA;
      case "B":
        return COLORS.componentB;
      case "C":
        return COLORS.componentC;
      case "D":
        return COLORS.componentD;
      case "F":
        return COLORS.componentF;
      default:
        return COLORS.textMuted;
    }
  }

  function getOverallScoreColor(grade) {
    switch (grade) {
      case "Excellent":
        return COLORS.componentA;
      case "Good":
        return COLORS.componentB;
      case "Fair":
        return COLORS.componentC;
      case "Needs Improvement":
        return COLORS.componentD;
      case "Poor":
        return COLORS.componentF;
      default:
        return COLORS.textMuted;
    }
  }

  function isOnboardingBased(component) {
    return component.factors?.source === "Self-reported (onboarding)";
  }

  function isPaymentTracked(component) {
    return (
      component.name === "Payment Consistency" &&
      component.factors?.total_bills !== undefined
    );
  }

  function isPaymentNotApplicable(component) {
    return (
      component.name === "Payment Consistency" &&
      component.factors?.status === "not_applicable"
    );
  }

  function isPaymentNoData(component) {
    return (
      component.name === "Payment Consistency" &&
      !isOnboardingBased(component) &&
      !isPaymentTracked(component)
    );
  }

  function isSpendingTracked(component) {
    return (
      component.name === "Spending Discipline" &&
      component.factors?.spending_ratio !== undefined
    );
  }

  function isSavingsEstimatedFromSpending(component) {
    return (
      component.name === "Savings Behaviour" &&
      component.factors?.savings_rate !== undefined
    );
  }

  function getComponentSource(component) {
    if (isPaymentNotApplicable(component)) {
      return "Not applicable — no bills reported";
    }

    if (isOnboardingBased(component)) {
      return "Based on onboarding response";
    }

    if (isPaymentTracked(component)) {
      return component.factors?.uses_rolling_history
        ? "Based on recorded bill outcomes"
        : "Based on tracked bills";
    }

    if (isSpendingTracked(component)) {
      return component.factors?.uses_rolling_history
        ? "Based on recorded spending"
        : "Based on tracked spending";
    }

    if (isSavingsEstimatedFromSpending(component)) {
      return component.factors?.uses_rolling_history
        ? "Estimated from recorded spending"
        : "Estimated from tracked spending";
    }

    return "Not enough tracked data yet";
  }

  function getComponentSourceColor(component) {
    if (isOnboardingBased(component)) {
      return COLORS.warning;
    }

    if (
      isPaymentTracked(component) ||
      isSpendingTracked(component) ||
      isSavingsEstimatedFromSpending(component)
    ) {
      return COLORS.textDim;
    }

    return COLORS.textMuted;
  }

  function renderDetailRow(label, value, highlight = false) {
    return (
      <View style={styles.factorRow}>
        <Text style={styles.factorLabel}>{label}</Text>
        <Text
          style={[
            styles.factorValue,
            highlight && styles.factorValueHighlighted,
          ]}
        >
          {value}
        </Text>
      </View>
    );
  }

function renderComponentAbout(title, description) {
  return (
    <View style={styles.aboutComponentContainer}>
      <Text style={styles.aboutComponentTitle}>{title}</Text>
      <Text style={styles.aboutComponentText}>{description}</Text>
    </View>
  );
}

function renderScoringGuide(items) {
  if (!items || items.length === 0) return null;

  return (
    <>
      <Text style={styles.factorsTitle}>How this is scored</Text>

      {items.map((item, index) => (
        <View key={index}>
          {renderDetailRow(item.label, item.points)}
        </View>
      ))}

      <View style={styles.factorDivider} />
    </>
  );
}

function renderPaymentDetails(component) {
  const factors = component.factors || {};

  if (isOnboardingBased(component)) {
    return (
      <>
        {renderComponentAbout(
          "About this component, Payment Consistency looks at how reliably you pay recorded bills. Paying on time improves this component, while late and missed payments reduce it.")}

        <View style={styles.factorsContainer}>
          <Text style={styles.factorsTitle}>Score source</Text>

          <Text style={styles.factorNote}>
            Your Payment Consistency score currently comes from your onboarding
            response.
          </Text>

          <Text style={styles.factorNoteSecondary}>
            Track bill payments to replace this estimate with your actual payment
            behaviour.
          </Text>
        </View>
      </>
    );
  }

  if (isPaymentTracked(component)) {
    const totalBills = Number(factors.total_bills || 0);
    const billsOnTime = Number(factors.bills_on_time || 0);
    const billsLate = Number(factors.bills_late || 0);
    const billsMissed = Number(factors.bills_missed || 0);

    const onTimePoints = Number(factors.paid_on_time_points || 100);
    const latePoints = Number(factors.paid_late_points || 50);
    const missedPoints = Number(factors.missed_points || 0);

    const totalPaymentPoints = Number(factors.total_payment_points || 0);
    const paymentScore = Number(factors.payment_score || component.score);

    const paymentLabel =
      totalBills === 1 ? "recorded payment" : "recorded payments";

    return (
      <>
        {renderComponentAbout(
          "About this component, Payment Consistency looks at how reliably you pay recorded bills. Paying on time improves this component, while late and missed payments reduce it.")}

        <View style={styles.factorsContainer}>
          <Text style={styles.factorsTitle}>How this is scored</Text>

          {renderDetailRow("Paid on time", `${onTimePoints} pts`)}
          {renderDetailRow("Paid late", `${latePoints} pts`)}
          {renderDetailRow("Missed", `${missedPoints} pts`)}

          <View style={styles.factorDivider} />

          <Text style={styles.factorsTitle}>Your recorded payments</Text>

          {renderDetailRow("Paid on time", billsOnTime)}
          {renderDetailRow("Paid late", billsLate)}
          {renderDetailRow("Missed", billsMissed)}

          {renderDetailRow("Component Score", `${paymentScore} / 100`)}

          <Text style={styles.calculationWorking}>
            ({billsOnTime} × {onTimePoints}) + ({billsLate} ×{" "}
            {latePoints}) + ({billsMissed} × {missedPoints}) ={" "}
            {totalPaymentPoints} points
          </Text>

          <Text style={styles.calculationWorking}>
            {totalPaymentPoints} ÷ {totalBills} = {paymentScore} / 100
          </Text>
        </View>

        {totalBills > 0 && totalBills < 3 && (
          <View style={styles.limitedDataCard}>
            <Text style={styles.limitedDataTitle}>Limited data</Text>

            <Text style={styles.limitedDataText}>
              Only {totalBills} {paymentLabel}{" "}
              {totalBills === 1 ? "has" : "have"} been tracked so far. This
              component may change significantly as more payments are recorded.
            </Text>
          </View>
        )}
      </>
    );
  }

  if (isPaymentNotApplicable(component)) {
    return (
      <>
        {renderComponentAbout(
          "About this component, Payment Consistency evaluates recorded bill-payment behaviour when bill data is applicable.")}

        <View style={styles.factorsContainer}>
          <Text style={styles.factorsTitle}>Score source</Text>
          <Text style={styles.factorNote}>
            You reported that you do not currently have bills, so this component
            is not being interpreted as a payment weakness.
          </Text>
          <Text style={styles.factorNoteSecondary}>
            A neutral fallback is still used in the numerical Trust Score.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      {renderComponentAbout(
        "About this component, Payment Consistency looks at how reliably you pay recorded bills. Paying on time improves this component, while late and missed payments reduce it."
      )}

      <View style={styles.factorsContainer}>
        <Text style={styles.factorsTitle}>Score source</Text>

        <Text style={styles.factorNote}>
          No bill payment data has been recorded yet.
        </Text>
      </View>
    </>
  );
}

function renderSpendingDetails(component) {
  const factors = component.factors || {};

  if (isOnboardingBased(component)) {
    return (
      <>
        {renderComponentAbout(
          "About this component, Spending Discipline compares your recorded spending against your monthly income/allowance. A lower spending ratio improves this component.")}

        <View style={styles.factorsContainer}>
          <Text style={styles.factorsTitle}>Score source</Text>

          <Text style={styles.factorNote}>
            Your Spending Discipline score currently comes from your onboarding
            response.
          </Text>

          <Text style={styles.factorNoteSecondary}>
            Log spending in the Tracker to calculate this score from your
            recorded activity.
          </Text>
        </View>
      </>
    );
  }

  if (isSpendingTracked(component)) {
  return (
    <>
      {renderComponentAbout(
        "About this component, Spending Discipline compares your recorded spending against your monthly available amount. A lower spending ratio indicates better spending control.")}

      <View style={styles.factorsContainer}>
        {renderScoringGuide(factors.scoring_guide)}

      <Text style={styles.factorsTitle}>Your recorded spending</Text>

      {renderDetailRow("Available amount", factors.monthly_income)}

      {renderDetailRow(
        factors.uses_rolling_history
          ? "Average monthly spending"
          : "Tracked spending",
        factors.monthly_spending
      )}

      {renderDetailRow(
        factors.uses_rolling_history
          ? "Average spending ratio"
          : "Spending ratio",
        factors.spending_ratio
      )}

      {factors.score_band &&
        renderDetailRow("Your band", factors.score_band)
      }

      {renderDetailRow(
        "Component score",
        `${component.score} / 100`
      )}
      </View>
    </>
  );
}

  return (
    <>
      {renderComponentAbout(
        "About this component", 
        "Spending Discipline compares your recorded spending against your monthly available amount. A lower spending ratio means more room for bills, savings, and unexpected expenses.")}

      <View style={styles.factorsContainer}>
        <Text style={styles.factorsTitle}>Score source</Text>

        <Text style={styles.factorNote}>
          No tracked spending data is available yet.
        </Text>
      </View>
    </>
  );
}

function renderSavingsDetails(component) {
  const factors = component.factors || {};

  if (isOnboardingBased(component)) {
    return (
      <>
        {renderComponentAbout(
          "About this component, Savings Behaviour estimates how much of your monthly available amount is left after recorded spending. A higher savings rate suggests a stronger financial buffer.")}

        <View style={styles.factorsContainer}>
          <Text style={styles.factorsTitle}>Score source</Text>

          <Text style={styles.factorNote}>
            Your Savings Behaviour score currently comes from your onboarding
            response.
          </Text>

          <Text style={styles.factorNoteSecondary}>
            Once you log spending, your estimated savings will be calculated
            from your available amount and tracked spending.
          </Text>
        </View>
      </>
    );
  }

  if (isSavingsEstimatedFromSpending(component)) {
    return (
      <>
        {renderComponentAbout(
          "About this component, Savings Behaviour estimates how much of your monthly available amount is left after recorded spending. A higher savings rate indicates stronger saving behaviour."
        )}

        <View style={styles.factorsContainer}>
          {renderScoringGuide(factors.scoring_guide)}

          <Text style={styles.factorsTitle}>Your estimated savings</Text>

          {renderDetailRow("Monthly income/allowance", factors.monthly_income)}

          {renderDetailRow(
            factors.uses_rolling_history
              ? "Average monthly spending"
              : "Tracked spending",
            factors.monthly_spending
          )}

          {renderDetailRow(
            factors.uses_rolling_history
              ? "Average estimated savings"
              : "Estimated savings",
            factors.monthly_savings
          )}

          {renderDetailRow(
            factors.uses_rolling_history
              ? "Average savings rate"
              : "Savings rate",
            factors.savings_rate
          )}

          {factors.score_band &&
            renderDetailRow("Your band", factors.score_band)
          }

          {renderDetailRow(
            "Component score",
            `${component.score} / 100`
          )}
        </View>
      </>
    );
  }

  return (
    <>
      {renderComponentAbout(
        "About this component, Savings Behaviour estimates how much of your monthly available amount is left after recorded spending. A higher savings rate suggests a stronger financial buffer."
      )}

      <View style={styles.factorsContainer}>
        <Text style={styles.factorsTitle}>Score source</Text>

        <Text style={styles.factorNote}>
          No tracked spending data is available to estimate savings yet.
        </Text>
      </View>
    </>
  );
}


  function renderComponentDetails(component) {
    if (component.name === "Payment Consistency") {
      return renderPaymentDetails(component);
    }

    if (component.name === "Spending Discipline") {
      return renderSpendingDetails(component);
    }

    if (component.name === "Savings Behaviour") {
      return renderSavingsDetails(component);
    }

    return null;
  }

  const combinedScore = score
    ? score.components.reduce(
        (total, component) => total + component.weighted_score,
        0
      )
    : 0;

  if (loading) {
    return (
      <View style={[COMMON.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      style={COMMON.screen}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData();
          }}
          tintColor={COLORS.accent}
        />
      }
    >
      {/* Header */}
      <Text style={styles.title}>Score Breakdown</Text>
      <Text style={styles.subtitle}>
        See what affects your Trust Score 
      </Text>

      {/* Overall Score Summary */}
      {score && (
        <View style={styles.overallCard}>

          <Text style={styles.overallScore}>{score.total_score}</Text>

          <Text
            style={[
              styles.overallGrade,
              { color: getOverallScoreColor(score.grade) },
            ]}
          >
            {score.grade}
          </Text>

          {/* Calculation Toggle */}
          <TouchableOpacity
            style={styles.calculationToggle}
            onPress={() => setShowCalculation(!showCalculation)}
            activeOpacity={0.7}
          >
            <Text style={styles.calculationToggleText}>
              Calculation details
            </Text>

            <View
              style={[
                styles.calculationArrow,
                showCalculation && styles.calculationArrowUp,
              ]}
            />
          </TouchableOpacity>

          {/* Collapsible Final Score Calculation */}
          {showCalculation && (
            <View style={styles.calculationContent}>

              {score.components.map((component, index) => (
                <View key={index} style={styles.calculationRow}>
                  <View style={styles.calculationComponentInfo}>
                    <Text style={styles.calculationLabel}>
                      {component.name}
                    </Text>
                    <Text style={styles.calculationFormula}>
                      {component.score} × {(component.weight * 100).toFixed(0)}%
                    </Text>
                  </View>

                  <Text style={styles.calculationValue}>
                    {component.weighted_score.toFixed(1)}
                  </Text>
                </View>
              ))}

              <View style={styles.calculationDivider} />

              <View style={styles.finalScoreRow}>
                <Text style={styles.finalScoreLabel}>Trust Score</Text>
                <Text style={styles.finalScoreValue}>
                  {combinedScore.toFixed(1)} → {score.total_score} / 100
                </Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Component Cards */}
      {score && (
        <View style={styles.componentsSection}>
          <View style={styles.componentsTitleRow}>
            <Text style={styles.cardTitle}>Components</Text>

            <TouchableOpacity
              style={styles.componentInfoButtonContainer}
              onPress={() =>
                Alert.alert(
                  "Component Grades",
                  "Each component is scored out of 100.\n\n" +
                    "85 and above: A\n" +
                    "70 to 84: B\n" +
                    "60 to 69: C\n" +
                    "50 to 59: D\n" +
                    "Below 50: F"
                )
              }
              accessibilityLabel="View component grade information"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.componentInfoButton}>ⓘ</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.componentsSubtext}>
            Tap each component for details and tips
          </Text>

          {score.components.map((component, index) => {
            const noPaymentData = isPaymentNoData(component);

            const color = noPaymentData
              ? COLORS.textMuted
              : getComponentColor(component);

            const isExpanded = expanded === index;
            const sourceText = getComponentSource(component);
            const sourceColor = getComponentSourceColor(component);

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.componentCard,
                  isExpanded && { borderColor: color + "55" },
                ]}
                onPress={() => setExpanded(isExpanded ? null : index)}
                activeOpacity={0.7}
              >
                {/* Component Header */}
                <View style={styles.componentHeader}>
                  <View style={styles.componentInfo}>
                    <Text style={styles.componentName}>{component.name}</Text>
                    <Text style={styles.componentWeight}>
                      {(component.weight * 100).toFixed(0)}% of Trust Score
                    </Text>
                  </View>

                  <View style={styles.componentScoreContainer}>
                    <Text style={[styles.componentScore, { color }]}>
                      {component.score}
                    </Text>
                    <Text style={styles.componentGrade}>
                      {isPaymentNotApplicable(component)
                        ? "N/A"
                        : noPaymentData
                        ? "No data"
                        : `Grade: ${component.grade}`}
                    </Text>
                  </View>
                </View>

                {/* Data Source */}
                <Text style={[styles.componentSource, { color: sourceColor }]}>
                  {sourceText}
                </Text>

                {/* Progress Bar */}
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      {
                        width: `${component.score}%`,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>

                {/* Expanded Details */}
                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {renderComponentDetails(component)}

                    {/* Tip */}
                    <View style={styles.feedbackContainer}>
                      <Text style={styles.feedbackTitle}>Tip</Text>
                      <Text style={styles.feedbackText}>
                        {component.feedback}
                      </Text>
                    </View>

                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.xl,
    paddingBottom: 100,
    paddingTop: SPACING.xxl + 20,
  },

  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  title: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },

  subtitle: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    marginBottom: SPACING.lg,
  },

  // Overall score
  overallCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.base,
    alignItems: "center",
    position: "relative",
  },

  overallScore: {
    fontSize: FONTS.hero,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -2,
  },

  overallGrade: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: SPACING.xs,
  },

  // Collapsible calculation
  calculationToggle: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  calculationToggleText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    fontWeight: "600",
  },

  calculationArrow: {
    width: 8,
    height: 8,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: COLORS.textDim,
    transform: [{ rotate: "45deg" }],
    marginRight: 3,
    marginBottom: 4,
  },

  calculationArrowUp: {
    transform: [{ rotate: "-135deg" }],
    marginBottom: 0,
    marginTop: 4,
  },

  calculationContent: {
    width: "100%",
    marginTop: SPACING.md,
  },

  calculationIntro: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
  },

  calculationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },

  calculationComponentInfo: {
  flex: 1,
  },

  calculationLabel: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  calculationFormula: {
  fontSize: FONTS.xs,
  color: COLORS.textMuted,
  marginTop: 2,
  },

  calculationValue: {
    minWidth: 52,
    fontSize: FONTS.sm,
    color: COLORS.text,
    fontWeight: "700",
    textAlign: "right",
  },

  calculationDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
  },

  calculationTotalLabel: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  calculationTotal: {
    fontSize: FONTS.sm,
    fontWeight: "700",
    color: COLORS.accent,
  },

  finalScoreRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  finalScoreLabel: {
    fontSize: FONTS.sm,
    fontWeight: "700",
    color: COLORS.text,
  },

  finalScoreValue: {
    fontSize: FONTS.md,
    fontWeight: "800",
    color: COLORS.accent,
  },

  calculationNote: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: SPACING.md,
  },

  // Components
  componentsSection: {
    marginBottom: SPACING.base,
  },

  componentsTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    marginBottom: SPACING.xs,
  },

  cardTitle: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
  },

  componentInfoButtonContainer: {
    paddingHorizontal: 2,
  },

  componentInfoButton: {
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
  },

  componentsSubtext: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.md,
  },

  componentCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.sm,
  },

  componentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },

  componentInfo: {
    flex: 1,
  },

  componentName: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
  },

  componentWeight: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    marginTop: 4,
  },

  componentScoreContainer: {
    alignItems: "flex-end",
    minWidth: 72,
  },

  componentScore: {
    fontSize: FONTS.xl,
    fontWeight: "800",
  },

  componentGrade: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginTop: 2,
  },

  componentSource: {
    fontSize: FONTS.xs,
    fontWeight: "500",
    marginBottom: SPACING.sm,
  },

  // Progress bar
  progressBarContainer: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },

  progressBar: {
    height: "100%",
    borderRadius: RADIUS.full,
  },

// Expanded content
expandedContent: {
  marginTop: SPACING.md,
  paddingTop: SPACING.md,
  borderTopWidth: 1,
  borderTopColor: COLORS.border,
},

aboutComponentContainer: {
  backgroundColor: COLORS.bg,
  borderRadius: RADIUS.md,
  padding: SPACING.md,
  marginBottom: SPACING.md,
},

aboutComponentTitle: {
  fontSize: FONTS.sm,
  fontWeight: "600",
  color: COLORS.textDim,
  marginBottom: SPACING.sm,
},

aboutComponentText: {
  fontSize: FONTS.sm,
  color: COLORS.text,
  lineHeight: 20,
},

factorsContainer: {
    backgroundColor: COLORS.bg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },

  factorsTitle: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.sm,
  },

  primaryFactorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xs,
  },

  primaryFactorLabel: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  primaryFactorValue: {
    fontSize: FONTS.md,
    fontWeight: "700",
    color: COLORS.accent,
  },

  basedOnCount: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.sm,
  },

  calculationWorking: {
  fontSize: FONTS.xs,
  color: COLORS.textDim,
  lineHeight: 18,
  marginTop: SPACING.xs,
  },

  factorDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: SPACING.xs,
  },

  factorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: SPACING.xs,
  },

  factorLabel: {
    fontSize: FONTS.sm,
    color: COLORS.text,
  },

  factorValue: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.text,
  },

  factorValueHighlighted: {
    color: COLORS.accent,
  },

  factorNote: {
    fontSize: FONTS.sm,
    color: COLORS.text,
    lineHeight: 20,
  },

  factorNoteSecondary: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },

  estimateNote: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    lineHeight: 18,
    marginTop: SPACING.sm,
  },

  limitedDataCard: {
    backgroundColor: COLORS.warningDim,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.warning,
  },

  limitedDataTitle: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.warning,
    marginBottom: SPACING.xs,
  },

  limitedDataText: {
    fontSize: FONTS.xs,
    color: COLORS.text,
    lineHeight: 18,
  },

  feedbackContainer: {
    backgroundColor: COLORS.accentDim,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.accent,
  },

  feedbackTitle: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.accent,
    marginBottom: SPACING.xs,
  },

  feedbackText: {
    fontSize: FONTS.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
});