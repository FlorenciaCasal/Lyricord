import { useCallback, useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import {
  getRevenueCatAvailability,
  getRevenueCatErrorMessage,
  loadPremiumPackages,
  purchasePremiumPackage,
  restorePremiumPurchases,
} from "../billing/revenueCat";
import type { RevenueCatPackageLike } from "../billing/revenueCatPackages";
import { colors } from "../theme";
import type { RootStackParamList } from "../types";
import { canStartPremiumPurchase, PREMIUM_AUTH_REQUIRED_MESSAGE } from "../utils/authGates";
import { formatImageImportLimit, formatLibraryLimit } from "../utils/premiumCopy";

type Props = NativeStackScreenProps<RootStackParamList, "Premium">;
type PurchaseKind = "monthly" | "annual";

function getAvailabilityMessage(reason: Exclude<ReturnType<typeof getRevenueCatAvailability>, { available: true }>["reason"]) {
  switch (reason) {
    case "disabled":
      return "Las compras no están habilitadas en esta versión.";
    case "missing-ios-api-key":
      return "Las compras todavía no están configuradas para iOS.";
    case "missing-android-api-key":
      return "Las compras todavía no están configuradas para Android.";
    case "native-module-unavailable":
      return "Esta versión todavía no incluye compras. Hace falta actualizar la app.";
    case "unsupported-platform":
      return "Las compras no están disponibles en esta plataforma.";
    default:
      return "Las compras no están disponibles en esta versión.";
  }
}

function PlanCard({
  title,
  packageInfo,
  loading,
  disabled,
  onPress,
}: {
  title: string;
  packageInfo: RevenueCatPackageLike | null;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.planCard,
        pressed && !disabled ? styles.planCardPressed : null,
        disabled ? styles.planCardDisabled : null,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.planTitle}>{title}</Text>
      <Text style={styles.planPrice}>
        {packageInfo?.product.priceString ?? (loading ? "Cargando..." : "No disponible")}
      </Text>
      {packageInfo?.product.title ? <Text style={styles.planMeta}>{packageInfo.product.title}</Text> : null}
    </Pressable>
  );
}

export function PremiumScreen({ navigation }: Props) {
  const { premium, refreshPremium, user } = useAuth();
  const isPremium = premium?.entitlements.premium ?? false;
  const [monthlyPackage, setMonthlyPackage] = useState<RevenueCatPackageLike | null>(null);
  const [annualPackage, setAnnualPackage] = useState<RevenueCatPackageLike | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(false);
  const [purchaseLoading, setPurchaseLoading] = useState<PurchaseKind | "restore" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadOfferings = useCallback(async () => {
    if (!user) return;

    const availability = getRevenueCatAvailability();
    if (!availability.available) {
      setError(getAvailabilityMessage(availability.reason));
      return;
    }

    setLoadingOfferings(true);
    setError(null);
    try {
      const packages = await loadPremiumPackages(user.id);
      setMonthlyPackage(packages.monthly);
      setAnnualPackage(packages.annual);
      if (!packages.monthly || !packages.annual) {
        setError("No encontramos los planes mensual y anual.");
      }
    } catch (reason) {
      setError(getRevenueCatErrorMessage(reason));
    } finally {
      setLoadingOfferings(false);
    }
  }, [user]);

  useEffect(() => {
    void loadOfferings();
  }, [loadOfferings]);

  async function refreshBackendAfterRevenueCatChange(customerInfoHasPremium: boolean) {
    await refreshPremium();
    setMessage(
      customerInfoHasPremium
        ? "Compra registrada. El plan puede tardar unos segundos en actualizarse."
        : "La operación terminó, pero todavía no encontramos un plan Premium activo.",
    );
  }

  async function purchase(kind: PurchaseKind) {
    if (!user) return;
    const selectedPackage = kind === "monthly" ? monthlyPackage : annualPackage;
    if (!selectedPackage) {
      setError("Ese plan todavía no está disponible.");
      return;
    }

    setPurchaseLoading(kind);
    setError(null);
    setMessage(null);
    try {
      const result = await purchasePremiumPackage(user.id, selectedPackage);
      await refreshBackendAfterRevenueCatChange(result.customerInfoHasPremium);
    } catch (reason) {
      const message = getRevenueCatErrorMessage(reason);
      if (message !== "Compra cancelada.") setError(message);
      else setMessage(message);
    } finally {
      setPurchaseLoading(null);
    }
  }

  async function restore() {
    if (!user) return;

    setPurchaseLoading("restore");
    setError(null);
    setMessage(null);
    try {
      const result = await restorePremiumPurchases(user.id);
      await refreshBackendAfterRevenueCatChange(result.customerInfoHasPremium);
    } catch (reason) {
      setError(getRevenueCatErrorMessage(reason));
    } finally {
      setPurchaseLoading(null);
    }
  }

  const isBusy = loadingOfferings || purchaseLoading !== null;
  const imageImportLimit = premium?.limits.ocrTotalLimit === undefined
    ? premium?.limits.ocrDailyLimit
    : premium.limits.ocrTotalLimit;

  if (!canStartPremiumPurchase(user)) {
    return (
      <ScrollView style={styles.root} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>MUSUM PREMIUM</Text>
          <Text style={styles.title}>Protegé tu compra y tu repertorio.</Text>
          <Text style={styles.subtitle}>{PREMIUM_AUTH_REQUIRED_MESSAGE}</Text>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Cuenta necesaria</Text>
          <Text style={styles.statusText}>
            Premium se vincula a tu cuenta de Musum para que puedas restaurar tus compras y recuperar tu plan.
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.authButton, pressed && styles.authButtonPressed]}
          onPress={() => navigation.navigate("Login")}
        >
          <Text style={styles.authButtonText}>Crear cuenta</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.authSecondaryButton, pressed && styles.restoreButtonPressed]}
          onPress={() => navigation.navigate("Login", { initialMode: "form" })}
        >
          <Text style={styles.restoreButtonText}>Iniciar sesión</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>MUSUM PREMIUM</Text>
        <Text style={styles.title}>Más espacio para tu repertorio.</Text>
        <Text style={styles.subtitle}>
          Guardá todas las canciones y versiones que quieras e importá letras y acordes desde imágenes sin límites. Las herramientas para tocar siguen siendo gratis.
        </Text>
      </View>

      <View style={styles.statusCard}>
        <Text style={styles.statusLabel}>Tu plan actual</Text>
        <Text style={styles.statusTitle}>{isPremium ? "Premium" : "Free"}</Text>
        <Text style={styles.statusText}>
          Biblioteca: {formatLibraryLimit(premium?.limits.maxSongs)}
        </Text>
        <Text style={styles.statusText}>
          Importar imágenes: {formatImageImportLimit(imageImportLimit)}
        </Text>
      </View>

      <View style={styles.benefits}>
        <Text style={styles.sectionTitle}>Qué incluye Premium</Text>
        <Text style={styles.benefit}>• Canciones y versiones ilimitadas.</Text>
        <Text style={styles.benefit}>• Importaciones de letras y acordes desde imágenes ilimitadas.</Text>
        <Text style={styles.benefit}>• El seguimiento de acordes y el cambio de tono siguen incluidos en Free.</Text>
      </View>

      <View style={styles.planRow}>
        <PlanCard
          title="Mensual"
          packageInfo={monthlyPackage}
          loading={loadingOfferings}
          disabled={isBusy || !monthlyPackage}
          onPress={() => void purchase("monthly")}
        />
        <PlanCard
          title="Anual"
          packageInfo={annualPackage}
          loading={loadingOfferings}
          disabled={isBusy || !annualPackage}
          onPress={() => void purchase("annual")}
        />
      </View>

      {purchaseLoading ? (
        <View style={styles.inlineLoading}>
          <ActivityIndicator color={colors.green} />
          <Text style={styles.inlineLoadingText}>
            {purchaseLoading === "restore" ? "Restaurando compras..." : "Abriendo compra segura..."}
          </Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.restoreButton, pressed && !isBusy ? styles.restoreButtonPressed : null]}
        onPress={() => void restore()}
        disabled={isBusy}
      >
        <Text style={styles.restoreButtonText}>Restaurar compras</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 36, gap: 16 },
  hero: { gap: 8 },
  eyebrow: { color: colors.green, fontWeight: "900", letterSpacing: 3, fontSize: 12 },
  title: { color: colors.text, fontSize: 34, lineHeight: 39, fontWeight: "900" },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  statusCard: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface, padding: 18, gap: 6 },
  statusLabel: { color: colors.muted, fontWeight: "800", fontSize: 12, letterSpacing: 1.4 },
  statusTitle: { color: colors.green, fontSize: 24, fontWeight: "900" },
  statusText: { color: colors.text, fontSize: 15 },
  benefits: { borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surfaceStrong, padding: 18, gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },
  benefit: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  planRow: { flexDirection: "row", gap: 10 },
  planCard: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface, padding: 16, gap: 6 },
  planCardPressed: { borderColor: colors.green },
  planCardDisabled: { opacity: 0.6 },
  planTitle: { color: colors.text, fontWeight: "900", fontSize: 17 },
  planPrice: { color: colors.green, fontWeight: "900", fontSize: 19 },
  planMeta: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  inlineLoading: { flexDirection: "row", alignItems: "center", gap: 10 },
  inlineLoadingText: { color: colors.muted, fontWeight: "700" },
  error: { color: colors.danger, lineHeight: 20 },
  message: { color: colors.green, lineHeight: 20 },
  restoreButton: { minHeight: 50, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  restoreButtonPressed: { borderColor: colors.green },
  restoreButtonText: { color: colors.green, fontWeight: "900", textAlign: "center" },
  authButton: { minHeight: 52, borderRadius: 999, backgroundColor: colors.green, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  authButtonPressed: { backgroundColor: colors.greenPressed },
  authButtonText: { color: colors.background, fontWeight: "900", textAlign: "center" },
  authSecondaryButton: { minHeight: 50, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
});
