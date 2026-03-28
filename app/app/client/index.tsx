import { ClientDashboardScreen } from "@/components/dashboard/client-dashboard-screen";
import { fetchMe } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function ClientDashboardRoute() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [displayName, setDisplayName] = useState("Responder");

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

      if (me.userType === "ngo") {
        router.replace("/ngo" as never);
        return;
      }

      if (me.userType === "helper") {
        router.replace("/helper" as never);
        return;
      }

      const preferredName =
        me.profile?.full_name?.trim() ||
        me.user.email?.split("@")[0] ||
        "Responder";
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
      <ClientDashboardScreen
        displayName={displayName}
        onSignOut={handleSignOut}
      />
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
