// Onboarding Step 1: Employment status

import { useRouter } from "expo-router";
import { useState } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS, COMMON, FONTS, RADIUS, SPACING } from "../../constants/theme";

const OPTIONS = [
  "Student",
  "Student with part-time work",
  "Working full-time",
  "Working part-time / freelance",
  "Serving national service",
];

export default function OnboardingStep1() {
  const router = useRouter();
  const [selected, setSelected] = useState(null);

  function handleNext() {
    if (selected === null) return;

    // Pass employment status to the next step
    router.push({
      pathname: "/onboarding/step2",
      params: { employment_status: OPTIONS[selected] },
    });
  }

  return (
    <SafeAreaView
       style={COMMON.screen}
       edges={["top", "left", "right", "bottom"]}>
      <View style={styles.container}>
        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: "33%" }]} />
        </View>
        <Text style={styles.stepText}>Step 1 of 3</Text>

        {/* Question */}
        <Text style={styles.title}>What's your current status?</Text>

        {/* Options */}
        <View style={styles.optionsContainer}>
          {OPTIONS.map((option, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.option,
                selected === index && styles.optionSelected,
              ]}
              onPress={() => setSelected(index)}
            >
              <Text
                style={[
                  styles.optionText,
                  selected === index && styles.optionTextSelected,
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Next button */}
        <TouchableOpacity
          style={[
            COMMON.button,
            COMMON.buttonPrimary,
            styles.nextButton,
            selected === null && styles.buttonDisabled,
          ]}
          onPress={handleNext}
          disabled={selected === null}
        >
          <Text style={COMMON.buttonText}>Next</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    marginBottom: SPACING.sm,
  },
  optionsContainer: {
    flex: 1,
    marginTop: SPACING.xl,
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
    fontSize: FONTS.base,
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
});