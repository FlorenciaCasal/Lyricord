import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { getConfiguredRegistrationUrl } from "../api/config";
import { colors } from "../theme";
import type { RootStackParamList } from "../types";
import {
  decideLoginBackAction,
  decideLoginSuccessAction,
  type LoginMode,
} from "../utils/accountAccess";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const openedFromWelcome = route.params?.fromWelcome === true;
  const openedFromLibrary = route.params?.fromLibrary === true;
  const initialMode = route.params?.initialMode ?? (openedFromWelcome ? "form" : "access");
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const showBack = mode === "form" || openedFromLibrary;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      const successAction = decideLoginSuccessAction({
        fromLibrary: openedFromLibrary,
        canGoBack: navigation.canGoBack(),
      });
      if (successAction === "goBack") {
        navigation.goBack();
      } else {
        navigation.replace("Library");
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos iniciar sesión.");
    } finally {
      setPending(false);
    }
  }

  async function openCreateAccount() {
    const registrationUrl = getConfiguredRegistrationUrl();
    if (!registrationUrl) {
      Alert.alert(
        "Registro no disponible",
        "El registro web no está configurado en esta versión. Si ya tenés cuenta, podés iniciar sesión.",
        [{ text: "Entendido" }],
      );
      return;
    }

    try {
      await Linking.openURL(registrationUrl);
    } catch {
      Alert.alert(
        "No pudimos abrir el registro",
        "Probá de nuevo más tarde. Tus canciones siguen guardadas en este dispositivo.",
        [{ text: "Entendido" }],
      );
    }
  }

  function goBackFromForm() {
    const backAction = decideLoginBackAction({
      mode,
      fromWelcome: openedFromWelcome,
      fromLibrary: openedFromLibrary,
      canGoBack: navigation.canGoBack(),
    });
    if (backAction === "goBack") {
      navigation.goBack();
      return;
    }
    if (backAction === "showAccess") {
      setError(null);
      setMode("access");
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {showBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={[styles.backButton, { top: insets.top + 8 }]}
          onPress={goBackFromForm}
          disabled={pending}
        >
          <Text style={styles.backButtonText}>Volver</Text>
        </Pressable>
      ) : null}

      <View style={styles.brandBlock}>
        <View style={styles.logoMark} accessibilityLabel="Musum">
          <Text style={styles.logoMarkText}>M</Text>
        </View>
        <Text style={styles.brandName}>Musum</Text>
        <Text style={styles.title}>Tus canciones, listas para tocar.</Text>
        <Text style={styles.subtitle}>Guardá letras y acordes, organizá tus versiones y tocá con seguimiento automático.</Text>
      </View>

      {mode === "access" ? (
        <View style={styles.accessActions}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => void openCreateAccount()}
          >
            <Text style={styles.buttonText}>Crear cuenta</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}
            onPress={() => setMode("form")}
          >
            <Text style={styles.secondaryButtonText}>Iniciar sesión</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Iniciar sesión</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            editable={!pending}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Contraseña"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoComplete="current-password"
            editable={!pending}
            onSubmitEditing={submit}
          />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={submit}
            disabled={pending || !email || !password}
          >
            {pending ? <ActivityIndicator color="#000" /> : <Text style={styles.buttonText}>Iniciar sesión</Text>}
          </Pressable>
          <Pressable style={styles.secondaryAction} onPress={() => void openCreateAccount()} disabled={pending}>
            <Text style={styles.secondaryActionText}>Crear cuenta</Text>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: colors.background, gap: 32 },
  backButton: {
    position: "absolute",
    left: 20,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  backButtonText: { color: colors.green, fontSize: 15, fontWeight: "800" },
  brandBlock: { gap: 12 },
  logoMark: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMarkText: { color: colors.green, fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -2 },
  brandName: { color: colors.green, fontSize: 17, fontWeight: "900", letterSpacing: 3 },
  title: { color: colors.text, fontSize: 38, lineHeight: 42, fontWeight: "800", letterSpacing: -1.2 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  accessActions: { gap: 12 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 28, padding: 20, gap: 14 },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginBottom: 2 },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surfaceStrong,
    color: colors.text,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: { color: colors.danger, lineHeight: 20 },
  button: { minHeight: 52, borderRadius: 26, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", marginTop: 4 },
  buttonPressed: { backgroundColor: colors.greenPressed },
  buttonText: { color: "#000", fontWeight: "800", fontSize: 16 },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonPressed: { borderColor: colors.green },
  secondaryButtonText: { color: colors.green, fontWeight: "900", fontSize: 16 },
  secondaryAction: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  secondaryActionText: { color: colors.green, fontWeight: "800", fontSize: 15 },
});
