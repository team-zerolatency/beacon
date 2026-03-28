import { NgoDashboardScreen } from "@/components/dashboard/ngo-dashboard-screen";
import { fetchMe } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function NgoDashboardRoute() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [displayName, setDisplayName] = useState("Coordinator");

  useEffect(() => {
    async function bootstrap() {
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false);
        setAllowed(false);
        return;
      }

      const me = await fetchMe();
      if (!me) {
        setLoading(false);
        setAllowed(false);
        return;
      }

      if (me.userType !== "ngo") {
        router.replace(me.userType === "helper" ? "/helper" : "/client");
        return;
      }

      const preferredName =
        me.profile?.full_name?.trim() ||
        me.user.email?.split("@")[0] ||
        "Coordinator";
      setDisplayName(preferredName);
      setAllowed(true);
      setLoading(false);
    }

    void bootstrap();
  }, [router]);

  async function handleSignOut() {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  if (!allowed) {
    return <Redirect href="/login" />;
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, title: "" }} />
      <NgoDashboardScreen displayName={displayName} onSignOut={handleSignOut} />
    </>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000",
  },
});
