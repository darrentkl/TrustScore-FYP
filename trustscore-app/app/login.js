// Login screen

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
import { login } from "../services/api";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim()) {
      Alert.alert("Missing Field", "Please enter your email.");
      return;
    }

    if (!password) {
      Alert.alert("Missing Field", "Please enter your password.");
      return;
    }

    setLoading(true);

    try {
      await login(email.trim(), password);
      router.replace("/(tabs)/dashboard");
    } catch (error) {
      Alert.alert("Login Failed", error.message);
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
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>TrustScore</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
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
            placeholder="Enter your password"
            placeholderTextColor={COLORS.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[
              COMMON.button,
              COMMON.buttonPrimary,
              styles.loginButton,
              loading && styles.buttonDisabled,
            ]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={COLORS.bg} />
            ) : (
              <Text style={COMMON.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>

          {/* Register link */}
          <TouchableOpacity
            style={styles.registerLink}
            onPress={() => router.push("/register")}
          >
            <Text style={styles.registerText}>
              Don't have an account?{" "}
              <Text style={styles.registerTextAccent}>Sign up</Text>
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
  header: {
    alignItems: "center",
    marginBottom: SPACING.xxl,
  },
  logo: {
    fontSize: FONTS.title,
    fontWeight: "800",
    color: COLORS.accent,
    letterSpacing: -1,
  },
  form: {
    marginBottom: SPACING.xl,
  },
  label: {
    fontSize: FONTS.sm,
    fontWeight: "600",
    color: COLORS.textDim,
    marginBottom: SPACING.xs,
    marginTop: SPACING.md,
  },
  loginButton: {
    marginTop: SPACING.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  registerLink: {
    alignItems: "center",
    marginTop: SPACING.base,
  },
  registerText: {
    fontSize: FONTS.sm,
    color: COLORS.textDim,
  },
  registerTextAccent: {
    color: COLORS.accent,
    fontWeight: "600",
  },
});