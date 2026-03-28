import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";

type FeedEntry = {
  id: string;
  line: string;
};

const PLACEHOLDER_FEED: FeedEntry[] = [
  { id: "1", line: "10:42 AM - Signal relayed to 2 nearby devices" },
  { id: "2", line: "10:41 AM - Mesh route updated via Node-AX91" },
  { id: "3", line: "10:39 AM - Beacon heartbeat broadcast sent" },
  { id: "4", line: "10:37 AM - SMS fallback channel is armed" },
];

export default function HomeScreen() {
  const [smsFallbackEnabled, setSmsFallbackEnabled] = useState(true);
  const [sosState, setSosState] = useState("Standby");

  const pulseA = useSharedValue(0);
  const pulseB = useSharedValue(0.35);

  useEffect(() => {
    pulseA.value = withRepeat(
      withTiming(1, {
        duration: 2400,
        easing: Easing.out(Easing.cubic),
      }),
      -1,
      false,
    );

    pulseB.value = withRepeat(
      withTiming(1.35, {
        duration: 2400,
        easing: Easing.out(Easing.cubic),
      }),
      -1,
      false,
    );
  }, [pulseA, pulseB]);

  const pulseAStyle = useAnimatedStyle(() => {
    const progress = pulseA.value % 1;
    return {
      opacity: 0.35 - progress * 0.35,
      transform: [{ scale: 1 + progress * 1.7 }],
    };
  });

  const pulseBStyle = useAnimatedStyle(() => {
    const progress = pulseB.value % 1;
    return {
      opacity: 0.28 - progress * 0.28,
      transform: [{ scale: 1 + progress * 1.7 }],
    };
  });

  async function handleSosPress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSosState("SOS broadcasted");
  }

  function handleMapPress() {
    setSosState("Offline map ready");
  }

  function handleSmsFallbackPress() {
    setSmsFallbackEnabled((prev) => !prev);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.root}>
        <View style={styles.meshBanner}>
          <View style={styles.meshDot} />
          <Text style={styles.meshBannerText}>
            Mesh Active: 4 Nodes in Range
          </Text>
        </View>

        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>ONE-TAP SOS</Text>
          <Text style={styles.heroSubtitle}>
            Immediate disaster beacon broadcast
          </Text>

          <View style={styles.pulseZone}>
            <Animated.View style={[styles.radarPulse, pulseAStyle]} />
            <Animated.View style={[styles.radarPulse, pulseBStyle]} />

            <Pressable
              onPress={handleSosPress}
              accessibilityRole="button"
              accessibilityLabel="One tap emergency SOS"
              style={({ pressed }) => [
                styles.sosButton,
                pressed ? styles.sosButtonPressed : null,
              ]}
            >
              <Text style={styles.sosButtonTitle}>SOS</Text>
              <Text style={styles.sosButtonSub}>{sosState}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.feedContainer}>
          <Text style={styles.feedTitle}>RELAY TERMINAL</Text>
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.feedScroll}
          >
            {PLACEHOLDER_FEED.map((entry) => (
              <Text key={entry.id} style={styles.feedLine}>
                {entry.line}
              </Text>
            ))}
          </ScrollView>
        </View>

        <View style={styles.bottomActionBar}>
          <Pressable
            onPress={handleMapPress}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.secondaryButtonPressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>Offline Map</Text>
          </Pressable>

          <Pressable
            onPress={handleSmsFallbackPress}
            style={({ pressed }) => [
              styles.secondaryButton,
              smsFallbackEnabled ? styles.secondaryButtonActive : null,
              pressed ? styles.secondaryButtonPressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>
              SMS Fallback {smsFallbackEnabled ? "ON" : "OFF"}
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  root: {
    flex: 1,
    backgroundColor: "#000000",
    paddingHorizontal: 16,
    paddingBottom: 18,
  },
  meshBanner: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#1f1f1f",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  meshDot: {
    width: 11,
    height: 11,
    borderRadius: 11,
    backgroundColor: "#32FF7E",
    marginRight: 10,
    shadowColor: "#32FF7E",
    shadowOpacity: 0.95,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  meshBannerText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  heroSection: {
    alignItems: "center",
    marginTop: 22,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  heroSubtitle: {
    marginTop: 4,
    color: "#FFFFFF",
    opacity: 0.82,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  pulseZone: {
    marginTop: 28,
    width: 280,
    height: 280,
    alignItems: "center",
    justifyContent: "center",
  },
  radarPulse: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 160,
    borderWidth: 2,
    borderColor: "#F97316",
    backgroundColor: "rgba(249, 115, 22, 0.08)",
  },
  sosButton: {
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F97316",
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  sosButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  sosButtonTitle: {
    color: "#FFFFFF",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: 1,
    lineHeight: 62,
  },
  sosButtonSub: {
    color: "#FFFFFF",
    marginTop: 2,
    fontSize: 16,
    fontWeight: "800",
  },
  feedContainer: {
    marginTop: 18,
    backgroundColor: "#121212",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1f1f1f",
    padding: 12,
    flex: 1,
    minHeight: 170,
    maxHeight: 240,
  },
  feedTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  feedScroll: {
    flex: 1,
  },
  feedLine: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 21,
    marginBottom: 8,
  },
  bottomActionBar: {
    marginTop: 14,
    flexDirection: "row",
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 12,
    backgroundColor: "#121212",
    borderWidth: 1,
    borderColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  secondaryButtonPressed: {
    opacity: 0.85,
  },
  secondaryButtonActive: {
    borderColor: "#3a3a3a",
    backgroundColor: "#171717",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
});
