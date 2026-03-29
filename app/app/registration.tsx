import {
  clearPendingRegistration,
  getPendingRegistration,
} from "@/lib/pending-registration";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { Link, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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

export default function RegistrationScreen() {
  const router = useRouter();
  const pending = getPendingRegistration();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(pending?.email ?? "");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      clearPendingRegistration();
    };
  }, []);

  async function handleRegistration() {
    if (!supabase || !isSupabaseConfigured) {
      setError("Missing Supabase config. Add EXPO_PUBLIC env vars.");
      return;
    }

    setError(null);
    setMessage(null);

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim();

    if (!normalizedName) {
      setError("Full name is required.");
      return;
    }

    if (!normalizedEmail || !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp(
      {
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedName,
          },
        },
      },
    );

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    if (!signUpData.session) {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (signInError) {
        setLoading(false);
        setError(
          "Registration created, but auto-login failed. Please login manually.",
        );
        return;
      }
    }

    setLoading(false);
    setMessage("Registration successful. Redirecting...");
    clearPendingRegistration();
    router.replace("/client" as never);
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.select({ ios: "padding", android: undefined })}
      >
        <View style={styles.card}>
          <Text style={styles.kicker}>BEACON Registration</Text>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>
            We prefilled your email from login. Add your full name and password
            to finish account setup.
          </Text>

          <TextInput
            value={fullName}
            onChangeText={setFullName}
            multiline={false}
            autoCorrect={false}
            spellCheck={false}
            textContentType="name"
            autoComplete="name"
            importantForAutofill="yes"
            inputMode="text"
            placeholder="Avery Thompson"
            placeholderTextColor="#6b7280"
            returnKeyType="next"
            style={styles.input}
          />

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
            placeholder="responder@beacon.org"
            placeholderTextColor="#6b7280"
            returnKeyType="next"
            style={styles.input}
          />

          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            multiline={false}
            autoCorrect={false}
            spellCheck={false}
            textContentType="newPassword"
            autoComplete="new-password"
            importantForAutofill="yes"
            inputMode="text"
            keyboardType="default"
            placeholder="Create password"
            placeholderTextColor="#6b7280"
            returnKeyType="done"
            onSubmitEditing={() => {
              void handleRegistration();
            }}
            style={styles.input}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.messageText}>{message}</Text> : null}

          <Pressable
            onPress={handleRegistration}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryButton,
              pressed ? styles.primaryButtonPressed : null,
              loading ? styles.buttonDisabled : null,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {loading ? "Creating account..." : "Create Account"}
            </Text>
          </Pressable>

          <Link href="/login" style={styles.linkText}>
            Already registered? Back to login
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
    color: "#FCD34D",
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
