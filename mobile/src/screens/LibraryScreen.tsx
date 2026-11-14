import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useAuth } from "../auth/AuthContext";
import { DevelopmentSongSyncControl } from "../components/DevelopmentSongSyncControl";
import { SongSyncConflictNotices } from "../components/SongSyncConflictNotices";
import { SongSyncStatusIndicator } from "../components/SongSyncStatusIndicator";
import { useAutomaticSongSync, useLocalSongOwnership, useSongRepository } from "../data/songs";
import { applyAnonymousSongLinkDecision } from "../data/songs/local/anonymousSongLinking";
import { colors } from "../theme";
import type { RootStackParamList, SongListItem } from "../types";
import { shouldShowGuestAccountAccess } from "../utils/accountAccess";
import { getSongDisplayMeta, getSongDisplayTitle } from "../utils/songDisplay";
import { shouldRefreshSyncPreview } from "../data/songs/sync/AutomaticSongSyncCoordinator";

type Props = NativeStackScreenProps<RootStackParamList, "Library">;

export function LibraryScreen({ navigation }: Props) {
  const { premium, signOut, user } = useAuth();
  const songRepository = useSongRepository();
  const localSongOwnership = useLocalSongOwnership();
  const {
    state: automaticSyncState,
    notifyConflictResolved,
    notifyLibraryFocused,
    notifyOwnershipLinked,
  } = useAutomaticSongSync();
  const [songs, setSongs] = useState<SongListItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncPreviewRefreshKey, setSyncPreviewRefreshKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [anonymousSongCount, setAnonymousSongCount] = useState(0);
  const [linkingAnonymousSongs, setLinkingAnonymousSongs] = useState(false);
  const activeOwnerIdRef = useRef<string | null>(user?.id ?? null);
  const linkConfirmationOpenRef = useRef(false);
  const previousAutomaticSyncStatusRef = useRef(automaticSyncState.status);
  activeOwnerIdRef.current = user?.id ?? null;

  const load = useCallback(async (refresh = false, silent = false) => {
    if (!silent) {
      refresh ? setRefreshing(true) : setLoading(true);
    }
    setError(null);
    try {
      setSongs(await songRepository.listSongs());
      setSyncPreviewRefreshKey((value) => value + 1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos cargar las canciones.");
    } finally {
      if (!silent) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [songRepository]);

  useEffect(() => {
    const previousStatus = previousAutomaticSyncStatusRef.current;
    previousAutomaticSyncStatusRef.current = automaticSyncState.status;
    if (shouldRefreshSyncPreview(previousStatus, automaticSyncState.status)) {
      void load(false, true);
    }
  }, [automaticSyncState.status, load]);

  useEffect(() => {
    activeOwnerIdRef.current = user?.id ?? null;
    linkConfirmationOpenRef.current = false;
    setAnonymousSongCount(0);
    setLinkingAnonymousSongs(false);
  }, [user?.id]);

  const refreshAnonymousSongCount = useCallback(async () => {
    const ownerId = user?.id;
    if (!ownerId) {
      setAnonymousSongCount(0);
      return;
    }

    const summary = await localSongOwnership.getAnonymousSongSummary();
    if (activeOwnerIdRef.current === ownerId) {
      setAnonymousSongCount(summary.songCount);
    }
  }, [localSongOwnership, user?.id]);

  const confirmAnonymousSongLinking = useCallback(() => {
    const ownerId = user?.id;
    if (!ownerId || anonymousSongCount === 0 || linkingAnonymousSongs || linkConfirmationOpenRef.current) return;

    linkConfirmationOpenRef.current = true;
    const linkScope = anonymousSongCount === 1
      ? "Se vinculará la canción guardada en este dispositivo."
      : `Se vincularán todas las canciones guardadas en este dispositivo (${anonymousSongCount} en total).`;
    const closeConfirmation = () => {
      linkConfirmationOpenRef.current = false;
    };
    Alert.alert(
      "Guardar en mi cuenta",
      `${linkScope} Después Musum intentará respaldarlas en tu cuenta.`,
      [
        { text: "Ahora no", style: "cancel", onPress: closeConfirmation },
        {
          text: "Guardar en mi cuenta",
          onPress: () => {
            closeConfirmation();
            setLinkingAnonymousSongs(true);
            void applyAnonymousSongLinkDecision({
              decision: "confirm",
              ownerUserId: ownerId,
              ownership: localSongOwnership,
              isOwnerActive: (candidate) => activeOwnerIdRef.current === candidate,
              notifyOwnershipLinked,
            })
              .then(async () => {
                if (activeOwnerIdRef.current !== ownerId) return;
                await Promise.all([load(), refreshAnonymousSongCount()]);
              })
              .catch(() => {
                if (activeOwnerIdRef.current === ownerId) {
                  Alert.alert(
                    "No pudimos vincular las canciones",
                    "Tus canciones siguen guardadas en este dispositivo. Probá de nuevo más tarde.",
                  );
                }
              })
              .finally(() => {
                if (activeOwnerIdRef.current === ownerId) setLinkingAnonymousSongs(false);
              });
          },
        },
      ],
      { cancelable: true, onDismiss: closeConfirmation },
    );
  }, [anonymousSongCount, linkingAnonymousSongs, load, localSongOwnership, notifyOwnershipLinked, refreshAnonymousSongCount, user?.id]);

  const filteredSongs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return songs;

    return songs.filter((song) => {
      const haystack = [
        getSongDisplayTitle(song),
        getSongDisplayMeta(song),
        song.title,
        song.artist ?? "",
        song.key ?? "",
        song.versionName ?? "",
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, songs]);

  useFocusEffect(useCallback(() => {
    if (user) notifyLibraryFocused();
    void load();
    void refreshAnonymousSongCount().catch(() => undefined);
  }, [load, notifyLibraryFocused, refreshAnonymousSongCount, user]));
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: user
        ? () => (
          <Pressable onPress={() => navigation.navigate("Premium")} hitSlop={12}>
            <Text style={styles.premiumLink}>{premium?.entitlements.premium ? "Premium" : "Free"}</Text>
          </Pressable>
        )
        : () => null,
      headerRight: user
        ? () => (
          <Pressable onPress={() => void signOut()} hitSlop={12}>
            <Text style={styles.logout}>Salir</Text>
          </Pressable>
        )
        : () => null,
    });
  }, [navigation, premium?.entitlements.premium, signOut, user]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.green} size="large" /></View>;

  const hasSongs = songs.length > 0;
  const isSearching = query.trim().length > 0;

  return (
    <FlatList
      data={filteredSongs}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.green} />}
      ListHeaderComponent={(
        <View style={styles.heading}>
          <View style={styles.headingTop}>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>TU BIBLIOTECA</Text>
              <Text style={styles.title}>Letras y acordes</Text>
            </View>
            {shouldShowGuestAccountAccess(user?.id) ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Abrir opciones de cuenta"
                style={({ pressed }) => [styles.accountButton, pressed && styles.accountButtonPressed]}
                onPress={() => navigation.navigate("Login", { fromLibrary: true, initialMode: "access" })}
              >
                <View style={styles.accountIcon} accessibilityElementsHidden>
                  <View style={styles.accountIconHead} />
                  <View style={styles.accountIconBody} />
                </View>
                <Text style={styles.accountButtonText}>Cuenta</Text>
              </Pressable>
            ) : null}
          </View>
          {hasSongs ? (
            <>
              <Pressable
                style={({ pressed }) => [styles.newButton, pressed && styles.newButtonPressed]}
                onPress={() => navigation.navigate("SongForm", { mode: "create" })}
              >
                <Text style={styles.newButtonText}>Nueva canción</Text>
              </Pressable>
              <TextInput
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
                placeholder="Buscar en tu biblioteca"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </>
          ) : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {user && anonymousSongCount > 0 ? (
            <View style={styles.anonymousSongsNotice}>
              <View style={styles.anonymousSongsCopy}>
                <Text style={styles.anonymousSongsTitle}>
                  {anonymousSongCount === 1
                    ? "1 canción está sólo en este dispositivo"
                    : `${anonymousSongCount} canciones están sólo en este dispositivo`}
                </Text>
                <Text style={styles.anonymousSongsText}>
                  Guardalas en tu cuenta para que Musum pueda respaldarlas.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={linkingAnonymousSongs}
                style={({ pressed }) => [
                  styles.anonymousSongsButton,
                  pressed && !linkingAnonymousSongs && styles.anonymousSongsButtonPressed,
                  linkingAnonymousSongs && styles.anonymousSongsButtonDisabled,
                ]}
                onPress={confirmAnonymousSongLinking}
              >
                {linkingAnonymousSongs ? (
                  <ActivityIndicator color={colors.background} size="small" />
                ) : (
                  <Text style={styles.anonymousSongsButtonText}>Guardar en mi cuenta</Text>
                )}
              </Pressable>
            </View>
          ) : null}
          {user ? <SongSyncStatusIndicator /> : null}
          {__DEV__ && user ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cerrar sesión en desarrollo"
              style={({ pressed }) => [styles.devLogoutButton, pressed && styles.devLogoutButtonPressed]}
              onPress={() => void signOut()}
            >
              <Text style={styles.devLogoutButtonText}>Cerrar sesión (DEV)</Text>
            </Pressable>
          ) : null}
          {__DEV__ ? (
            <DevelopmentSongSyncControl
              onSynced={() => load()}
              refreshKey={syncPreviewRefreshKey}
            />
          ) : null}
          {user ? (
            <SongSyncConflictNotices
              onResolved={async () => {
                notifyConflictResolved();
                await load();
              }}
              refreshKey={syncPreviewRefreshKey}
            />
          ) : null}
        </View>
      )}
      ListEmptyComponent={(
        isSearching ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No encontramos canciones</Text>
            <Text style={styles.emptyText}>Probá buscar por título, artista, tonalidad o nombre de versión.</Text>
          </View>
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Tu repertorio empieza acá</Text>
            <Text style={styles.emptyText}>Agregá tu primera canción y tenela lista para cuando quieras tocar.</Text>
            <Pressable
              style={({ pressed }) => [styles.emptyButton, pressed && styles.newButtonPressed]}
              onPress={() => navigation.navigate("SongForm", { mode: "create" })}
            >
              <Text style={styles.newButtonText}>+ Agregar canción</Text>
            </Pressable>
            <Text style={styles.emptyHint}>Pegá una letra con acordes o escribila. No necesitás una cuenta para empezar.</Text>
          </View>
        )
      )}
      renderItem={({ item }) => {
        const displayMeta = getSongDisplayMeta(item);
        return (
          <Pressable
            style={({ pressed }) => [styles.song, pressed && styles.songPressed]}
            onPress={() => navigation.navigate("SongDetail", { songId: item.id, title: getSongDisplayTitle(item) })}
          >
            <View style={styles.songIcon}>
              <Text style={styles.songIconText}>♫</Text>
            </View>
            <View style={styles.songTextBlock}>
              <Text style={styles.songTitle} numberOfLines={1}>{getSongDisplayTitle(item)}</Text>
              {displayMeta ? <Text style={styles.songMeta} numberOfLines={1}>{displayMeta}</Text> : null}
            </View>
            <Text style={styles.open}>›</Text>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  list: { padding: 18, paddingBottom: 40, gap: 11 },
  heading: { marginBottom: 12, gap: 12 },
  headingTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: colors.greenPressed, fontWeight: "900", letterSpacing: 3.2, fontSize: 12 },
  title: { color: colors.text, fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -0.9 },
  accountButton: {
    minHeight: 44,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginBottom: 1,
    flexShrink: 0,
  },
  accountButtonPressed: { borderColor: colors.green, backgroundColor: "rgba(166, 230, 62, 0.08)" },
  accountButtonText: { color: colors.green, fontSize: 13, fontWeight: "900" },
  accountIcon: { width: 16, height: 18, alignItems: "center", justifyContent: "flex-end" },
  accountIconHead: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.green },
  accountIconBody: {
    width: 14,
    height: 7,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    backgroundColor: colors.green,
    marginTop: 2,
  },
  error: { color: colors.danger, marginTop: 8 },
  anonymousSongsNotice: {
    borderWidth: 1,
    borderColor: "rgba(166, 230, 62, 0.24)",
    borderRadius: 18,
    backgroundColor: "rgba(166, 230, 62, 0.06)",
    padding: 14,
    gap: 12,
  },
  anonymousSongsCopy: { gap: 4 },
  anonymousSongsTitle: { color: colors.text, fontSize: 14, lineHeight: 19, fontWeight: "900" },
  anonymousSongsText: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  anonymousSongsButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  anonymousSongsButtonPressed: { backgroundColor: colors.greenPressed },
  anonymousSongsButtonDisabled: { opacity: 0.65 },
  anonymousSongsButtonText: { color: colors.background, fontSize: 14, fontWeight: "900" },
  logout: { color: colors.green, fontWeight: "700", fontSize: 16 },
  premiumLink: { color: colors.green, fontWeight: "800", fontSize: 15 },
  newButton: {
    minHeight: 52,
    borderRadius: 20,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  newButtonPressed: { backgroundColor: colors.greenPressed },
  newButtonText: { color: colors.background, fontWeight: "900", fontSize: 16 },
  searchInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  song: {
    minHeight: 78,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  songPressed: { borderColor: colors.green, backgroundColor: "rgba(34, 197, 94, 0.08)" },
  songIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: "rgba(2, 6, 23, 0.74)",
    borderWidth: 1,
    borderColor: "rgba(166, 230, 62, 0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  songIconText: { color: colors.greenPressed, fontSize: 23, fontWeight: "900" },
  songTextBlock: { flex: 1, minWidth: 0 },
  songTitle: { color: colors.text, fontSize: 17, fontWeight: "900" },
  songMeta: { color: colors.muted, fontSize: 13, marginTop: 4 },
  open: { color: colors.text, opacity: 0.76, fontWeight: "900", fontSize: 28, marginTop: -2 },
  empty: { alignItems: "center", padding: 28, borderWidth: 1, borderColor: colors.border, borderRadius: 24, backgroundColor: colors.surface, gap: 10 },
  emptyTitle: { color: colors.text, fontWeight: "900", fontSize: 21, textAlign: "center" },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: "center" },
  emptyButton: {
    alignSelf: "stretch",
    minHeight: 48,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 6,
  },
  emptyHint: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 2 },
  devLogoutButton: {
    alignSelf: "flex-start",
    minHeight: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(166, 230, 62, 0.32)",
    backgroundColor: "rgba(166, 230, 62, 0.08)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  devLogoutButtonPressed: { borderColor: colors.green },
  devLogoutButtonText: { color: colors.green, fontWeight: "900", fontSize: 13 },
});
