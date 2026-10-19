// Onboarding Step 3: Financial habits

import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";
import { updateProfile } from "../../services/api";
import Slider from "@react-native-community/slider";

function getSpendingBaseline(percent) {
  if (percent >= 100) return 0;
  if (percent <= 50) return 100;
  if (percent <= 60) return 85;
  if (percent <= 70) return 70;
  if (percent <= 80) return 50;
  if (percent <= 90) return 30;
  return 10;
}

function getSavingBaseline(percent) {
  if (percent >= 40) return 100;
  if (percent >= 30) return 85;
  if (percent >= 20) return 70;
  if (percent >= 15) return 50;
  if (percent >= 10) return 30;
  if (percent > 0) return 10;
  return 0;
}

const PAYMENT_OPTIONS = [
  { label: "Always on time", value: 100 },
  { label: "Sometimes late", value: 75 },
  { label: "Often late or missed", value: 25 },
  { label: "I don't have bills", value: -1 },
];

export default function OnboardingStep3() {
  const router = useRouter();
  const params = useLocalSearchParams();

  const [spendingPercent, setSpendingPercent] = useState(50);
  const [savingPercent, setSavingPercent] = useState(50);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(false);

  const isFinancialSplitValid =
    spendingPercent + savingPercent <= 100;

  const allAnswered =
    payment !== null &&
    isFinancialSplitValid;

  async function handleNext() {
    if (!allAnswered || loading) return;

    setLoading(true);

    try {
      await updateProfile({
        employment_status: params.employment_status,
        monthly_income: parseFloat(params.monthly_income),
        baseline_spending: getSpendingBaseline(spendingPercent),
        baseline_savings: getSavingBaseline(savingPercent),
        baseline_payment: PAYMENT_OPTIONS[payment].value,
        onboarding_completed: true,
      });

      router.replace("/(tabs)/dashboard");
    } catch (error) {
      Alert.alert("Error", "Something went wrong. Please try again.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView 
      style={COMMON.screen}
      edges={["top", "left", "right", "bottom"]}>
      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.container}
      >
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: "100%" }]} />
        </View>

        <Text style={styles.stepText}>Step 3 of 3</Text>

        {/* Title */}
        <Text style={styles.title}>Your financial habits</Text>

        <Text style={styles.subtitle}>
          This helps us give you a personalised starting score.
        </Text>

        {/* Question 1: Spending */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>
            How much of your income or allowance do you usually spend each month?
          </Text>

          <Text style={styles.sliderValue}>
            {spendingPercent >= 100
              ? "100% or more"
              : `${spendingPercent}%`}
          </Text>

          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={spendingPercent}
            onValueChange={setSpendingPercent}
            minimumTrackTintColor={COLORS.accent}
            maximumTrackTintColor={COLORS.border}
            thumbTintColor={COLORS.accent}
          />

          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>0%</Text>
            <Text style={styles.sliderLabel}>50%</Text>
            <Text style={styles.sliderLabel}>100%</Text>
          </View>
        </View>

        {/* Question 2: Saving */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>
            How much of your income or allowance do you usually save each month?
          </Text>

          <Text style={styles.sliderValue}>{savingPercent}%</Text>

          <Slider
            style={styles.slider}
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={savingPercent}
            onValueChange={setSavingPercent}
            minimumTrackTintColor={COLORS.accent}
            maximumTrackTintColor={COLORS.border}
            thumbTintColor={COLORS.accent}
          />

          <View style={styles.sliderLabels}>
            <Text style={styles.sliderLabel}>0%</Text>
            <Text style={styles.sliderLabel}>50%</Text>
            <Text style={styles.sliderLabel}>100%</Text>
          </View>

          {!isFinancialSplitValid && (
            <Text style={styles.validationText}>
              Spending and saving cannot exceed 100% of your income or allowance.
            </Text>
          )}
        </View>

        {/* Question 3: Bill Payment */}
        <View style={styles.questionBlock}>
          <Text style={styles.questionText}>
            How do you usually handle your bills?
          </Text>

          {PAYMENT_OPTIONS.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.option,
                payment === index && styles.optionSelected,
              ]}
              onPress={() => setPayment(index)}
            >
              <Text
                style={[
                  styles.optionText,
                  payment === index && styles.optionTextSelected,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Finish button */}
        <TouchableOpacity
          style={[
            COMMON.button,
            COMMON.buttonPrimary,
            styles.nextButton,
            (!allAnswered || loading) && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={!allAnswered || loading}
        >
          {loading ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <Text style={COMMON.buttonText}>See My TrustScore</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flex: 1,
  },

  container: {
    padding: SPACING.xl,
    paddingBottom: 100,
  },

  progressContainer: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.sm,
  },

  progressBar: {
    height: "100%",
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.full,
  },

  stepText: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginBottom: SPACING.xl,
  },

  title: {
    fontSize: FONTS.xxl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },

  subtitle: {
    fontSize: FONTS.md,
    color: COLORS.textDim,
    marginBottom: SPACING.xl,
  },

  questionBlock: {
    marginBottom: SPACING.xl,
  },

  questionText: {
    fontSize: FONTS.base,
    fontWeight: "600",
    color: COLORS.text,
    marginBottom: SPACING.md,
    lineHeight: 22,
  },

  option: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  optionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentDim,
  },

  optionText: {
    fontSize: FONTS.md,
    color: COLORS.text,
  },

  optionTextSelected: {
    color: COLORS.accent,
    fontWeight: "600",
  },

  nextButton: {
    marginTop: SPACING.base,
  },

  buttonDisabled: {
    opacity: 0.4,
  },
  slider: {
  width: "100%",
  height: 40,
},

sliderValue: {
  fontSize: FONTS.xl,
  fontWeight: "700",
  color: COLORS.accent,
  textAlign: "center",
  marginBottom: SPACING.xs,
},

sliderLabels: {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
},

sliderLabel: {
  fontSize: FONTS.xs,
  color: COLORS.textMuted,
},
validationText: {
  fontSize: FONTS.sm,
  color: COLORS.warning,
  marginTop: SPACING.lg,
  lineHeight: 20,
},
});