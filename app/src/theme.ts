import { Platform } from "react-native";

export const colors = {
  bg: "#F1F3F7",
  surface: "#FFFFFF",
  paper: "#FFF9E8",
  paperEdge: "#EFE3C2",
  text: "#111827",
  muted: "#6B7280",
  border: "#E5E7EB",
  primary: "#3555D6",
  primaryText: "#FFFFFF",
  danger: "#C62828",
  dangerBg: "#FDECEC",
  cash: "#0F7B4F",
  card: "#3555D6",
};

export const mono = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, monospace" });
