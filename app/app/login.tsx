import { Link, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { fetchMe } from "@/lib/auth";
import { setPendingRegistration } from "@/lib/pending-registration";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function handleAuth() {
    if (!supabase || !isSupabaseConfigured) {
      setError("Missing Supabase config. Add EXPO_PUBLIC env vars.");
      return;
    }

    const normalizedEmail = email.trim();
    setError(null);
    setMessage(null);

    if (!normalizedEmail || !password) {
      setError("Email and password are required.");
      return;
    }

    setLoading(true);

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

    if (signInData.user) {
      const me = await fetchMe();
      setLoading(false);
      setMessage("Login successful. Redirecting...");

      if (me?.userType === "ngo") {
        router.replace("/ngo" as never);
        return;
      }

      if (me?.userType === "client") {
        router.replace("/client" as never);
        return;
      }

      router.replace("/client" as never);
      return;
    }

    setLoading(false);
    setError(signInError?.message ?? "Account not found. Please register.");
    setPendingRegistration({ email: normalizedEmail, password });
    router.push("/registration");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <View style={styles.card}>
          <Text style={styles.kicker}>BEACON Access</Text>
          <Text style={styles.title}>Login / Registration</Text>
          <Text style={styles.subtitle}>
            Enter your email and password. If no account exists, you will be
            redirected to registration.
          </Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            multiline={false}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="emailAddress"
            autoComplete="email"
            importantForAutofill="yes"
            inputMode="email"
            keyboardType="email-address"
            placeholder="ops@beacon.org"
            placeholderTextColor="#6b7280"
            returnKeyType="next"
            onSubmitEditing={() => {
              // Keep focus flow deterministic for soft keyboards.
            }}
            style={styles.input}
          />

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            multiline={false}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textContentType="password"
            autoComplete="password"
            importantForAutofill="yes"
            inputMode="text"
            keyboardType="default"
            placeholder="Enter your password"
            placeholderTextColor="#6b7280"
            returnKeyType="done"
            onSubmitEditing={() => {
              void handleAuth();
            }}
            style={styles.input}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.messageText}>{message}</Text> : null}

          <Pressable
            onPress={handleAuth}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : null,
              loading ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "Checking account..." : "Continue"}
            </Text>
          </Pressable>

          <Link href="/registration" style={styles.linkText}>
            New user? Create an account
          </Link>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#000000",
  },
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#262626",
    backgroundColor: "#121212",
    padding: 20,
    gap: 12,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "800",
    color: "#FDBA74",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    fontSize: 32,
    color: "#FFFFFF",
    fontWeight: "900",
  },
  subtitle: {
    color: "#D4D4D4",
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#404040",
    borderRadius: 12,
    backgroundColor: "#050505",
    color: "#FFFFFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 4,
    borderRadius: 12,
    backgroundColor: "#F97316",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  linkText: {
    marginTop: 4,
    textAlign: "center",
    color: "#FDE68A",
    fontSize: 14,
    fontWeight: "700",
  },
  errorText: {
    color: "#FCA5A5",
    borderWidth: 1,
    borderColor: "#7f1d1d",
    backgroundColor: "#450a0a",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: "600",
  },
  messageText: {
    color: "#86EFAC",
    borderWidth: 1,
    borderColor: "#14532d",
    backgroundColor: "#052e16",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontWeight: "600",
  },
});
