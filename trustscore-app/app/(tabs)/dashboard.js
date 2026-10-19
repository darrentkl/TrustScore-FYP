import { useState, useEffect, useRef } from "react";
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
import { useRouter } from "expo-router";
import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";
import {
  getScore,
  getProfile,
  getScoreHistory,
  getInsights,
  getInsightAdvice,
} from "../../services/api";
import Svg, {
  Polyline,
  Circle,
  Line,
  Text as SvgText,
} from "react-native-svg";

export default function DashboardScreen() {
  const router = useRouter();
  const [score, setScore] = useState(null);
  const [profile, setProfile] = useState(null);
  const [history, setHistory] = useState([]);
  const [insights, setInsights] = useState(null);
  const [aiAdvice, setAiAdvice] = useState(null);
  const [aiAdviceLoading, setAiAdviceLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Keep the same generated advice while the financial context used by the LLM has not changed. This avoids a new OpenAI call when the user navigates between screeens
  const lastInsightSignatureRef = useRef(null);
  const currentInsightSignatureRef = useRef(null);
  const adviceRequestInFlightRef = useRef(false);

  const { useIsFocused } = require("@react-navigation/native");
  const isFocused = useIsFocused();

  useEffect(() => {
    if (isFocused) {
      loadData();
    }
  }, [isFocused]);

  function buildInsightSignature(insightData, scoreData) {
    if (!insightData || !scoreData) {
      return null;
    }

    // The signature mirrors the important context supplied to the LLM. Current score/component values refresh when recent transactions, bills, or income affect the user's current position, even when the broad trend direction has not changed.
    return JSON.stringify({
      totalScore: scoreData.total_score,
      scoreGrade: scoreData.grade,
      components: (scoreData.components || []).map((component) => ({
        name: component.name,
        score: component.score,
        grade: component.grade,
        factors: component.factors || null,
      })),
      monthsTracked: insightData.months_tracked,
      spendingTrend: insightData.spending_trend || null,
      savingsTrend: insightData.savings_trend || null,
      fastestGrowingCategory:
        insightData.fastest_growing_category || null,
      topCategory: insightData.top_category || null,
      currentMonthActivity: insightData.current_month_activity || null,
    });
  }

  async function loadAiAdvice(insightData, scoreData) {
    const signature = buildInsightSignature(insightData, scoreData);
    currentInsightSignatureRef.current = signature;

    if (!signature) {
      setAiAdvice(null);
      setAiAdviceLoading(false);
      lastInsightSignatureRef.current = null;
      return;
    }

    // Reuse the current advice if the calculated insight facts are unchanged.
    if (
      lastInsightSignatureRef.current === signature &&
      aiAdvice
    ) {
      return;
    }

    if (adviceRequestInFlightRef.current) {
      return;
    }

    adviceRequestInFlightRef.current = true;
    setAiAdviceLoading(true);

    try {
      const advice = await getInsightAdvice();

      // Only show the response if it still belongs to the latest insight facts.
      if (currentInsightSignatureRef.current === signature) {
        setAiAdvice(advice);
        lastInsightSignatureRef.current = signature;
      }
    } catch (error) {
      console.error("Failed to generate AI insight:", error);

      if (currentInsightSignatureRef.current === signature) {
        setAiAdvice(null);
      }
    } finally {
      adviceRequestInFlightRef.current = false;

      if (currentInsightSignatureRef.current === signature) {
        setAiAdviceLoading(false);
      }
    }
  }

  async function loadData() {
    try {
      const [profileData, scoreData] = await Promise.all([
        getProfile(),
        getScore(),
      ]);

      const historyData = await getScoreHistory(6);

      const normalizedHistory = Array.isArray(historyData)
        ? historyData
        : historyData?.history || historyData?.data || [];

      setProfile(profileData);
      setScore(scoreData);
      setHistory(normalizedHistory);

      // If this insight fails, Dashboard should continue to work normally.
      try {
        const insightsData = await getInsights();
        setInsights(insightsData);

        // Generate the personalised wording in the background. Do not await for this call, allows dashboard to be responsive
        loadAiAdvice(insightsData, scoreData);
      } catch (insightError) {
        console.error("Failed to load insights:", insightError);
        setInsights(null);
      }
    } catch (error) {
      console.error("Failed to load data:", error);

      if (
        error.message === "Session expired. Please log in again." ||
        error.message === "Not logged in"
      ) {
        Alert.alert("Session Expired", "Please log in again.");
        router.replace("/login");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function getScoreColor(grade) {
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

  function getComponentGradeColor(grade) {
  switch (grade) {
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

function isPaymentNotApplicable(component) {
  return (
    component.name === "Payment Consistency" &&
    component.factors?.status === "not_applicable"
  );
}

function isPaymentNoData(component) {
  return (
    component.name === "Payment Consistency" &&
    component.factors?.total_bills === undefined &&
    component.factors?.source !== "Self-reported (onboarding)"
  );
}

  function renderLineChart() {
    if (history.length < 2) return null;

    const chartWidth = 300;
    const chartHeight = 100;
    const paddingTop = 15;
    const paddingBottom = 20;
    const paddingLeft = 10;
    const paddingRight = 10;

    const scores = history.map((h) => h.total_score);
    const maxScore = Math.max(...scores) + 10;
    const minScore = Math.min(...scores) - 10;
    const range = maxScore - minScore || 1;

    const points = scores.map((s, i) => {
      const x =
        paddingLeft +
        (i / (scores.length - 1)) *
          (chartWidth - paddingLeft - paddingRight);

      const y =
        paddingTop +
        ((maxScore - s) / range) *
          (chartHeight - paddingTop - paddingBottom);

      return { x, y, score: s };
    });

    const polylinePoints = points
      .map((p) => `${p.x},${p.y}`)
      .join(" ");

    return (
      <Svg
        width="100%"
        height={chartHeight + 10}
        viewBox={`0 0 ${chartWidth} ${chartHeight + 10}`}
      >
        <Line
          x1={paddingLeft}
          y1={paddingTop}
          x2={chartWidth - paddingRight}
          y2={paddingTop}
          stroke={COLORS.border}
          strokeWidth="0.5"
        />

        <Line
          x1={paddingLeft}
          y1={chartHeight - paddingBottom}
          x2={chartWidth - paddingRight}
          y2={chartHeight - paddingBottom}
          stroke={COLORS.border}
          strokeWidth="0.5"
        />

        <Polyline
          points={polylinePoints}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <Circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={i === points.length - 1 ? 4 : 2.5}
            fill={
              i === points.length - 1
                ? COLORS.accent
                : COLORS.accent + "88"
            }
          />
        ))}

        {points.map((p, i) => (
          <SvgText
            key={`label-${i}`}
            x={p.x}
            y={p.y - 8}
            fontSize="8"
            fill={
              i === points.length - 1
                ? COLORS.accent
                : COLORS.textMuted
            }
            textAnchor="middle"
            fontWeight={i === points.length - 1 ? "bold" : "normal"}
          >
            {p.score}
          </SvgText>
        ))}
      </Svg>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loadingText}>
          Calculating your TrustScore...
        </Text>
      </View>
    );
  }

  const scoreProgress = score ? score.total_score / 100 : 0;
  const arcLength = 2 * Math.PI * 75 * 0.75;

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
      <View style={styles.header}>
        <Text style={styles.headerGreeting}>
          Welcome back, {profile?.name?.split(" ")[0] || "User"}
        </Text>
      </View>

      {/* Score Card */}
      {score && (
        <View style={styles.scoreCard}>
          <TouchableOpacity
            style={styles.infoButton}
            onPress={() =>
              Alert.alert(
                "About Trust Score",
                "Your score uses up to the latest 6 completed calendar months of recorded activity. \n\n" +
                "Score range: 0-100\n\n" +
                "85-100: Excellent\n" +
                "70-84: Good\n" +
                "60-69: Fair\n" +
                "50-59: Needs Improvement\n" +
                "0-49: Poor"
              )
            }
            accessibilityLabel="View trust score range information"
          >
            <Text style={styles.infoButtonText}>ⓘ</Text>
          </TouchableOpacity>

          <Text style={styles.scoreLabel}>TRUST SCORE</Text>

          {/* Score Ring */}
          <View style={styles.ringContainer}>
            <Svg width={180} height={180} viewBox="0 0 180 180">
              {/* Background arc */}
              <Circle
                cx="90"
                cy="90"
                r="75"
                fill="none"
                stroke={COLORS.border}
                strokeWidth="10"
                strokeDasharray={`${arcLength} ${
                  2 * Math.PI * 75 * 0.25
                }`}
                strokeLinecap="round"
                transform="rotate(135 90 90)"
              />

              {/* Score arc */}
              <Circle
                cx="90"
                cy="90"
                r="75"
                fill="none"
                stroke={getScoreColor(score.grade)}
                strokeWidth="10"
                strokeDasharray={`${
                  arcLength * scoreProgress
                } ${2 * Math.PI * 75}`}
                strokeLinecap="round"
                transform="rotate(135 90 90)"
              />
            </Svg>

            <View style={styles.ringCenter}>
              <Text style={styles.ringScore}>{score.total_score}</Text>
              <Text
                style={[
                  styles.ringGrade,
                  { color: getScoreColor(score.grade) },
                ]}
              >
                {score.grade}
              </Text>
            </View>
          </View>

          {/* Score Reliability */}
          {score.confidence && (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  `Score Reliability: ${score.confidence}`,
                  score.confidence_message
                );
              }}
              style={[
                styles.confidenceBadge,
                {
                  backgroundColor:
                    score.confidence === "High"
                      ? COLORS.accentDim
                      : score.confidence === "Medium" ||
                        score.confidence === "Low"
                      ? COLORS.warningDim
                      : COLORS.surfaceLight,
                },
              ]}
            >
              <Text
                style={[
                  styles.confidenceText,
                  {
                    color:
                      score.confidence === "High"
                        ? COLORS.accent
                        : score.confidence === "Medium" ||
                          score.confidence === "Low"
                        ? COLORS.warning
                        : COLORS.textMuted,
                  },
                ]}
              >
                Score reliability: {score.confidence}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Score Trend */}
      {history.length > 1 && (
        <View style={styles.trendCard}>
          <Text style={styles.cardTitle}>Score History</Text>
          {renderLineChart()}
        </View>
      )}

      {/* Version 2 - Personalised credit-focused advice */}
      {insights && (
        <View style={styles.insightsCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Personalised Tips</Text>
          </View>

          <View style={styles.aiAdviceSection}>
            {aiAdviceLoading ? (
              <View style={styles.aiAdviceLoadingRow}>
                <ActivityIndicator
                  size="small"
                  color={COLORS.accent}
                />
                <Text style={styles.aiAdviceLoadingText}>
                  Generating personalised tips...
                </Text>
              </View>
            ) : aiAdvice?.text ? (
              <>
                <Text style={styles.aiAdviceText}>
                  {aiAdvice.text}
                </Text>
              </>
            ) : (
              <Text style={styles.aiAdviceLoadingText}>
                Personalised tips are temporarily unavailable.
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Component Summary */}
      {score && (
        <View style={styles.componentSummaryCard}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardTitle}>Score Breakdown</Text>
            <TouchableOpacity
              onPress={() => router.push("/(tabs)/breakdown")}
            >
              <Text style={styles.seeAll}>See details</Text>
            </TouchableOpacity>
          </View>

        {score.components.map((component, index) => {
          const noPaymentData = isPaymentNoData(component);

          const componentColor = noPaymentData
            ? COLORS.textMuted
            : getComponentGradeColor(component.grade);

          return (
            <View key={index} style={styles.componentRow}>
              <Text style={styles.componentName}>{component.name}</Text>

              <View style={styles.componentRight}>
                <Text
                  style={[
                    styles.componentScore,
                    { color: componentColor },
                  ]}
                >
                  {component.score}
                </Text>

                <Text
                  style={[
                    styles.componentGrade,
                    noPaymentData && styles.componentGradeNoData,
                  ]}
                >
                  {isPaymentNotApplicable(component)
                    ? "N/A"
                    : noPaymentData
                    ? "No data"
                    : component.grade}
                </Text>
              </View>
            </View>
          );
        })}
        </View>
)}

      {/* Income warning */}
      {profile && parseFloat(profile.monthly_income || 0) === 0 && (
        <TouchableOpacity
          style={styles.warningCard}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.warningText}>
            Set your monthly income in Settings for a more accurate trust
            score →
          </Text>
        </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: COLORS.textDim,
    fontSize: FONTS.md,
    marginTop: SPACING.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.lg,
  },
  headerGreeting: {
    fontSize: FONTS.xl,
    fontWeight: "600",
    color: COLORS.text,
  },
  scoreCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    marginBottom: SPACING.base,
    position: "relative",
  },
    infoButton: {
    position: "absolute",
    top: SPACING.md,
    right: SPACING.md,
    padding: SPACING.xs,
  },

  infoButtonText: {
    fontSize: FONTS.md,
    color: COLORS.textMuted,
    fontWeight: "600",
  },
  scoreLabel: {
    fontSize: FONTS.xs,
    fontWeight: "600",
    color: COLORS.text,
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  ringContainer: {
    width: 180,
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
  },
  ringCenter: {
    position: "absolute",
    width: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  ringScore: {
    fontSize: 42,
    fontWeight: "800",
    color: COLORS.text,
    letterSpacing: -2,
  },
  ringGrade: {
    width: 120,
    fontSize: FONTS.sm,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 2,
    textAlign: "center",
    lineHeight: 16,
  },
  confidenceBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: RADIUS.full,
    marginTop: 0,
  },
  confidenceText: {
    fontSize: FONTS.xs,
    fontWeight: "600",
  },
  trendCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.base,
  },
  insightsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.base,
  },

  insightsPeriod: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },

  insightsMessage: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    lineHeight: 20,
  },

  insightRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: SPACING.sm,
  },

  insightBullet: {
    fontSize: FONTS.md,
    color: COLORS.accent,
    marginRight: SPACING.sm,
    lineHeight: 20,
  },

  insightText: {
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    lineHeight: 20,
  },

  insightsFootnote: {
    marginTop: SPACING.md,
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },

  aiAdviceSection: {
    marginTop: SPACING.xs,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  aiAdviceTitle: {
    fontSize: FONTS.sm,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  aiAdviceLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
  },

  aiAdviceLoadingText: {
    marginLeft: SPACING.sm,
    flex: 1,
    fontSize: FONTS.sm,
    color: COLORS.textMuted,
    lineHeight: 20,
  },

  aiAdviceText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
    lineHeight: 20,
  },

  aiAdviceSource: {
    marginTop: SPACING.sm,
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },

  componentSummaryCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SPACING.base,
  },
  cardTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.md,
  },
  cardTitle: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.text,
  },
  seeAll: {
    fontSize: FONTS.sm,
    color: COLORS.accent,
    fontWeight: "500",
  },
  componentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  componentName: {
    fontSize: FONTS.sm,
    color: COLORS.text,
    flex: 1,
  },
  componentRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    minWidth: 115,
    gap: SPACING.sm,
  },
  componentScore: {
    fontSize: FONTS.base,
    fontWeight: "700",
    minWidth: 44,
    textAlign: "right",
  },
  componentGrade: {
    width: 52,
    fontSize: FONTS.md,
    fontWeight: "700",
    textAlign: "center",
    color: COLORS.textDim,
  },

  componentGradeNoData: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
  },
  warningCard: {
    backgroundColor: COLORS.warningDim,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.base,
    borderWidth: 1,
    borderColor: COLORS.warning + "33",
  },
  warningText: {
    fontSize: FONTS.sm,
    color: COLORS.warning,
    textAlign: "center",
  },
});