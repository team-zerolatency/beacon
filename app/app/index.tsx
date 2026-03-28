import { fetchMe } from "@/lib/auth";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

export default function IndexRoute() {
  const [isLoading, setIsLoading] = useState(true);
  const [nextRoute, setNextRoute] = useState<
    "/login" | "/client" | "/ngo" | "/helper"
  >("/login");

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setIsLoading(false);
      return;
    }

    const client = supabase;

    async function loadSession() {
      const {
        data: { session },
      } = await client.auth.getSession();

      if (!session?.user) {
        setNextRoute("/login");
        setIsLoading(false);
        return;
      }

      const me = await fetchMe();
      if (me?.userType === "ngo") {
        setNextRoute("/ngo");
      } else if (me?.userType === "helper") {
        setNextRoute("/helper");
      } else {
        setNextRoute("/client");
      }

      setIsLoading(false);
    }

    void loadSession();
  }, []);

  if (!isSupabaseConfigured) {
    return <Redirect href="/login" />;
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#F97316" />
        <Text style={styles.text}>Checking secure session...</Text>
      </View>
    );
  }

  return <Redirect href={nextRoute as never} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
});
