// Onboarding Step 2: Monthly income

import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";

export default function OnboardingStep2() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [income, setIncome] = useState("");

  const isValid = income.trim() && !isNaN(income) && parseFloat(income) > 0;

  function handleNext() {
    if (!isValid) return;

    router.push({
      pathname: "/onboarding/step3",
      params: {
        ...params,
        monthly_income: parseFloat(income),
      },
    });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView 
      style={COMMON.screen}
      edges={["top", "left", "right", "bottom"]}>
        <View style={styles.container}>
          {/* Progress bar */}
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: "66%" }]} />
          </View>
          <Text style={styles.stepText}>Step 2 of 3</Text>

          {/* Question */}
          <Text style={styles.title}>
            What's your monthly income or allowance?
          </Text>

          {/* Income input */}
          <View style={styles.inputContainer}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.incomeInput}
              placeholder="e.g. 500"
              placeholderTextColor={COLORS.textMuted}
              value={income}
              onChangeText={setIncome}
              keyboardType="decimal-pad"
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Next button */}
          <TouchableOpacity
            style={[
              COMMON.button,
              COMMON.buttonPrimary,
              styles.nextButton,
              !isValid && styles.buttonDimmed,
            ]}
            onPress={handleNext}
            disabled={!isValid}
          >
            <Text style={COMMON.buttonText}>Next</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: SPACING.xl,
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
    marginBottom: SPACING.xxl,
  },
  title: {
    fontSize: FONTS.xxl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.xl,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.base,
  },
  dollarSign: {
    fontSize: FONTS.xxl,
    fontWeight: "700",
    color: COLORS.accent,
    marginRight: SPACING.sm,
  },
  incomeInput: {
    flex: 1,
    fontSize: FONTS.xxl,
    fontWeight: "700",
    color: COLORS.text,
    paddingVertical: SPACING.base,
  },
  nextButton: {
    marginTop: SPACING.base,
  },
  buttonDimmed: {
    opacity: 0.4,
  },
});