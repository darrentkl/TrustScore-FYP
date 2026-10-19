// Check login and onboarding status when app is opened

import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { COLORS } from "../constants/theme";
import { getProfile, getToken } from "../services/api";

export default function Index() {
  const router = useRouter();


  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const token = await getToken();

      if (!token) {
        // No token — user needs to log in
        router.replace("/login");
        return;
      }

      // Token exists — check if onboarding is completed
      const profile = await getProfile();

      if (profile.onboarding_completed) {
        router.replace("/(tabs)/dashboard");
      } else {
        router.replace("/onboarding/step1");
      }
    } catch (error) {
      // Token expired or invalid
      router.replace("/login");
    }
      }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});