export const COLORS = {

  // Background colors
  bg: "#0a0e1a",
  surface: "#131829",
  surfaceLight: "#1a2036",
  

  // Accent colors
  accent: "#00d4aa",
  accentDim: "rgba(0,212,170,0.15)",


  // Status colors
  warning: "#ffb347",
  warningDim: "rgba(255,179,71,0.15)",
  danger: "#ff6b6b",
  dangerDim: "rgba(255,107,107,0.15)",


  // Trust Score grades colors
  scorePoor: "#ff5a66",
  scoreFair: "#ffd233",
  scoreGood: "#9be8d2",
  scoreVeryGood: "#5eddbb",
  scoreExceptional: "#00d4aa",

  // Component letter grades colors
  componentA: "#6FDF7B",
  componentB: "#D4EB5D",
  componentC: "#FAE238",
  componentD: "#F39A26",
  componentF: "#ED4B34",

  // Text
  text: "#e8ecf4",
  textDim: "#7a8299",
  textMuted: "#4a5268",

  // Borders
  border: "#1e2540",


  blue: "#5b8def",


};

export const FONTS = {
  xs: 10,
  sm: 12,
  md: 14,
  base: 16,
  lg: 18,
  xl: 20,
  xxl: 24,
  title: 28,
  hero: 42,
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 999,
};

// Common styles
export const COMMON = {
  screen: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  textInput: {
    backgroundColor: COLORS.surfaceLight,
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    color: COLORS.text,
    fontSize: FONTS.base,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  button: {
    borderRadius: RADIUS.md,
    padding: SPACING.base,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: COLORS.accent,
  },
  buttonText: {
    color: COLORS.bg,
    fontSize: FONTS.md,
    fontWeight: "700",
  },
};