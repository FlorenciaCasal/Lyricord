import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import { getConfiguredApiUrl } from "./src/api/config";
import {
  AutomaticSongSyncProvider,
  createAutoSyncSongRepository,
  LocalSongOwnershipProvider,
  ManualSongSyncProvider,
  openLocalSongRuntime,
  SongSyncConflictProvider,
  SongRepositoryProvider,
  type LocalSongRepository,
} from "./src/data/songs";
import type { AutomaticSongSyncCoordinator } from "./src/data/songs/sync/AutomaticSongSyncCoordinator";
import type { ManualSongSyncController } from "./src/data/songs/sync/ManualSongSyncController";
import type { SongSyncConflictController } from "./src/data/songs/sync/SongSyncConflictController";
import { ChordLabScreen } from "./src/screens/ChordLabScreen";
import { LibraryScreen } from "./src/screens/LibraryScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { PremiumScreen } from "./src/screens/PremiumScreen";
import { SongDetailScreen } from "./src/screens/SongDetailScreen";
import { SongFormScreen } from "./src/screens/SongFormScreen";
import { SongPlayModeScreen } from "./src/screens/SongPlayModeScreen";
import { WelcomeScreen } from "./src/screens/WelcomeScreen";
import type { RootStackParamList } from "./src/types";
import { colors } from "./src/theme";
import { decideInitialScreen } from "./src/utils/initialScreen";
import { getOnboardingCompleted } from "./src/utils/onboarding";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.green,
    background: colors.background,
    card: colors.background,
    border: colors.border,
    text: colors.text,
  },
};

function RootNavigator() {
  const { status } = useAuth();
  const [onboardingStatus, setOnboardingStatus] = useState<"loading" | "pending" | "completed">("loading");

  useEffect(() => {
    if (status === "authenticated") return;

    let mounted = true;
    getOnboardingCompleted()
      .then((completed) => {
        if (mounted) setOnboardingStatus(completed ? "completed" : "pending");
      })
      .catch(() => {
        if (mounted) setOnboardingStatus("pending");
      });

    return () => {
      mounted = false;
    };
  }, [status]);

  const initialScreen = decideInitialScreen(status, onboardingStatus);

  if (initialScreen === "loading") {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.background },
        }}
        initialRouteName={initialScreen === "welcome" ? "Welcome" : "Library"}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Library" component={LibraryScreen} options={{ title: "Musum" }} />
        <Stack.Screen name="Premium" component={PremiumScreen} options={{ title: "Premium" }} />
        <Stack.Screen
          name="SongDetail"
          component={SongDetailScreen}
          options={{
            title: "",
            headerBackTitle: "Biblioteca",
            headerBackButtonDisplayMode: "default",
          }}
        />
        <Stack.Screen name="SongForm" component={SongFormScreen} options={{ title: "Canción" }} />
        <Stack.Screen name="ChordLab" component={ChordLabScreen} options={{ title: "Laboratorio" }} />
        <Stack.Screen name="SongPlayMode" component={SongPlayModeScreen} options={{ title: "Modo tocar" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AppWithLocalSongs() {
  const { user } = useAuth();
  const [localSongRepository, setLocalSongRepository] = useState<LocalSongRepository | null>(null);
  const [manualSyncController, setManualSyncController] = useState<ManualSongSyncController | null>(null);
  const [automaticSyncCoordinator, setAutomaticSyncCoordinator] = useState<AutomaticSongSyncCoordinator | null>(null);
  const [syncConflictController, setSyncConflictController] = useState<SongSyncConflictController | null>(null);
  const [repositoryError, setRepositoryError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    let openedCoordinator: AutomaticSongSyncCoordinator | null = null;
    openLocalSongRuntime({
      apiUrl: getConfiguredApiUrl(),
      isDevelopment: __DEV__,
    })
      .then((runtime) => {
        openedCoordinator = runtime.automaticSyncCoordinator;
        if (mounted) {
          setLocalSongRepository(runtime.repository);
          setAutomaticSyncCoordinator(runtime.automaticSyncCoordinator);
          setManualSyncController(runtime.manualSyncController);
          setSyncConflictController(runtime.syncConflictController);
        }
      })
      .catch((reason) => {
        if (mounted) {
          setRepositoryError(reason instanceof Error ? reason.message : "No pudimos abrir la biblioteca local.");
        }
      });

    return () => {
      mounted = false;
      openedCoordinator?.dispose();
    };
  }, []);

  const songRepository = useMemo(
    () => {
      const repository = localSongRepository?.forOwner(user?.id ?? null);
      if (!repository || !automaticSyncCoordinator) return null;
      return createAutoSyncSongRepository(repository, () => automaticSyncCoordinator.requestSync("local-change"));
    },
    [automaticSyncCoordinator, localSongRepository, user?.id],
  );

  if (repositoryError) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingError}>{repositoryError}</Text>
      </View>
    );
  }

  if (!localSongRepository || !songRepository || !automaticSyncCoordinator || !manualSyncController || !syncConflictController) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }

  return (
    <LocalSongOwnershipProvider ownership={localSongRepository}>
      <AutomaticSongSyncProvider coordinator={automaticSyncCoordinator} ownerUserId={user?.id ?? null}>
        <ManualSongSyncProvider controller={manualSyncController}>
          <SongSyncConflictProvider controller={syncConflictController}>
            <SongRepositoryProvider key={user?.id ?? "guest"} repository={songRepository}>
              <StatusBar style="light" />
              <RootNavigator />
            </SongRepositoryProvider>
          </SongSyncConflictProvider>
        </ManualSongSyncProvider>
      </AutomaticSongSyncProvider>
    </LocalSongOwnershipProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppWithLocalSongs />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  loadingError: { color: colors.danger, textAlign: "center", padding: 24 },
});
