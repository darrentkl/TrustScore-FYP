// Register screen

import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { COLORS, COMMON, FONTS, SPACING } from "../constants/theme";
import { register } from "../services/api";

export default function RegisterScreen() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    // Validate inputs
    if (!name.trim()) {
      Alert.alert("Missing Field", "Please enter your name.");
      return;
    }

  const parsedAge = parseInt(age, 10);

    if (!age.trim() || isNaN(parsedAge) || parsedAge < 1 || parsedAge > 100) {
      Alert.alert("Invalid Age", "Please enter a valid age between 1 and 100.");
      return;
    }
    if (!email.trim()) {
      Alert.alert("Missing Field", "Please enter your email.");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      await register(email.trim(), password, name.trim(), parsedAge);
      // Navigate to onboarding after successful registration
      router.replace("/onboarding/step1");
    } catch (error) {
      Alert.alert("Registration Failed", error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={COMMON.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.title}>Create Account</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={COMMON.textInput}
            placeholder="Enter your name"
            placeholderTextColor={COLORS.textMuted}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Age</Text>
          <TextInput
            style={COMMON.textInput}
            placeholder="Enter your age"
            placeholderTextColor={COLORS.textMuted}
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            maxLength={3}
          />

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={COMMON.textInput}
            placeholder="Enter your email"
            placeholderTextColor={COLORS.textMuted}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={COMMON.textInput}
            placeholder="At least 6 characters"
            placeholderTextColor={COLORS.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[
              COMMON.button,
              COMMON.buttonPrimary,
              styles.registerButton,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Text style={COMMON.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          {/* Login link */}
          <TouchableOpacity
            style={styles.loginLink}
            onPress={() => router.push("/login")}
          >
            <Text style={styles.loginText}>
              Already have an account?{" "}
              <Text style={styles.loginTextAccent}>Log in</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: SPACING.xl,
    justifyContent: "center",
  },
  form: {
    marginBottom: SPACING.xl,
  },
  title: {
    fontSize: FONTS.xl,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.lg,
  },
  label: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  registerButton: {
    marginTop: SPACING.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loginLink: {
    alignItems: "center",
    marginTop: SPACING.base,
  },
  loginText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },
  loginTextAccent: {
    color: COLORS.accent,
    fontWeight: "600",
  },
});