// Settings screen

import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
  TouchableWithoutFeedback,
} from "react-native";
import { useRouter } from "expo-router";
import { COLORS, FONTS, SPACING, RADIUS, COMMON } from "../../constants/theme";
import { getProfile, updateProfile, logout } from "../../services/api";
import { useSimulator } from "../../contexts/SimulatorContext";

const EMPLOYMENT_OPTIONS = [
  "Student",
  "Student with part-time work",
  "Working full-time",
  "Working part-time / freelance",
  "Serving National Service",
];

export default function SettingsScreen() {
  const router = useRouter();
  const { clearSimulatorDraft } = useSimulator();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [income, setIncome] = useState("");
  const [employment, setEmployment] = useState("");
  const [originalIncome, setOriginalIncome] = useState("");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const profile = await getProfile();
      setName(profile.name || "");
      setAge(profile.age ? String(profile.age) : "");
      const loadedIncome = profile.monthly_income
        ? String(profile.monthly_income)
        : "";

      setIncome(loadedIncome);
      setOriginalIncome(loadedIncome);
      setEmployment(profile.employment_status || "");
    } catch (error) {
      console.error("Failed to load profile:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (income && (isNaN(income) || parseFloat(income) < 0)) {
      Alert.alert("Invalid Income", "Please enter a valid amount.");
      return;
    }

    if (age && (isNaN(age) || parseInt(age) < 1 || parseInt(age) > 100)) {
      Alert.alert("Invalid Age", "Please enter a valid age.");
      return;
    }

    setSaving(true);

    try {
      const updateData = {};

      if (name.trim()) updateData.name = name.trim();
      if (age) updateData.age = parseInt(age);
      if (income) updateData.monthly_income = parseFloat(income);
      if (employment) updateData.employment_status = employment;

      const incomeChanged =
        updateData.monthly_income !== undefined &&
        Number(updateData.monthly_income) !== Number(originalIncome || 0);

      await updateProfile(updateData);
      if (incomeChanged) {
        clearSimulatorDraft();
      }

      Alert.alert(
        "Saved",
        "Your profile has been updated."
      );

      router.back();
    } catch (error) {
      Alert.alert("Error", "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    Alert.alert(
      "Log Out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await logout();
            router.replace("/login");
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[COMMON.screen, styles.centered]}>
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <ScrollView style={COMMON.screen} contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Settings</Text>
          <View style={{ width: 50 }} />
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={COMMON.textInput}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.label}>Age</Text>
          <TextInput
            style={COMMON.textInput}
            value={age}
            onChangeText={setAge}
            placeholder="Your age"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
          />
        </View>

        {/* Financial Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Financial Information</Text>

          <Text style={styles.label}>Monthly Income / Allowance ($)</Text>
          <View style={styles.incomeInputContainer}>
            <Text style={styles.dollarSign}>$</Text>
            <TextInput
              style={styles.incomeInput}
              value={income}
              onChangeText={setIncome}
              placeholder="e.g. 500"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.hint}>
            Your income/allowance is used to calculate your Trust Score. Please update if it changes.
          </Text>

          <Text style={styles.label}>Employment Status</Text>
          <View style={styles.optionsGrid}>
            {EMPLOYMENT_OPTIONS.map((option) => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.optionChip,
                  employment === option && styles.optionChipSelected,
                ]}
                onPress={() => setEmployment(option)}
              >
                <Text
                  style={[
                    styles.optionChipText,
                    employment === option && styles.optionChipTextSelected,
                  ]}
                >
                  {option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[
            COMMON.button,
            COMMON.buttonPrimary,
            styles.saveButton,
            saving && styles.buttonDisabled,
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.bg} />
          ) : (
            <Text style={COMMON.buttonText}>Save Changes</Text>
          )}
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Log Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: SPACING.xl,
    paddingTop: SPACING.xxl + 20,
    paddingBottom: 100,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.xl,
  },
  backButton: {
    fontSize: FONTS.md,
    color: COLORS.accent,
    fontWeight: "600",
  },
  title: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONTS.base,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.base,
  },
  label: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  incomeInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING.base,
  },
  dollarSign: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.accent,
    marginRight: SPACING.sm,
  },
  incomeInput: {
    flex: 1,
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
    paddingVertical: SPACING.base,
  },
  hint: {
    fontSize: FONTS.xs,
    color: COLORS.textMuted,
    marginTop: SPACING.xs,
    lineHeight: 16,
  },
  optionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  optionChip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionChipSelected: {
    backgroundColor: COLORS.accentDim,
    borderColor: COLORS.accent,
  },
  optionChipText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },
  optionChipTextSelected: {
    color: COLORS.accent,
    fontWeight: "600",
  },
  saveButton: {
    marginTop: SPACING.base,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  logoutButton: {
    alignItems: "center",
    paddingVertical: SPACING.base,
    marginTop: SPACING.lg,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.danger + "44",
  },
  logoutText: {
    fontSize: FONTS.md,
    fontWeight: "600",
    color: COLORS.danger,
  },
});