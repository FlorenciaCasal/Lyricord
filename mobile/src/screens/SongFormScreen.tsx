import { useEffect, useLayoutEffect, useRef, useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useHeaderHeight } from "@react-navigation/elements";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { extractTextFromImage } from "../api/client";
import { prepareOcrImage } from "../utils/prepareOcrImage";
import { useAuth } from "../auth/AuthContext";
import { useSongRepository } from "../data/songs";
import { colors } from "../theme";
import type { RootStackParamList, SongDetail, SongFormValues } from "../types";
import { canUseCloudOcr, CLOUD_OCR_AUTH_REQUIRED_MESSAGE } from "../utils/authGates";
import { appendExtractedSongContent } from "../utils/ocrContent";
import {
  getSongLimitReachedMessage,
  SONG_LIMIT_REACHED_MESSAGE,
} from "../utils/songFormSaveError";
import {
  createVersionFormValues,
  toVersionCreateValues,
  transposeVersionFormValues,
} from "../utils/versionForm";

type Props = NativeStackScreenProps<RootStackParamList, "SongForm">;

const emptyValues: SongFormValues = {
  title: "",
  artist: "",
  key: "",
  versionName: "",
  content: "",
  notes: "",
};

type PermissionKind = "photos";

type PermissionConfig = {
  blockedTitle: string;
  blockedMessage: string;
  deniedMessage: string;
};

const permissionMessages: Record<PermissionKind, PermissionConfig> = {
  photos: {
    blockedTitle: "Permiso de fotos desactivado",
    blockedMessage: "Para importar una imagen, permití que Musum acceda a tus fotos desde Ajustes.",
    deniedMessage: "Necesitamos permiso para elegir una imagen de tu galería.",
  },
};

function valuesFromSong(song: SongDetail): SongFormValues {
  return {
    title: song.title,
    artist: song.artist ?? "",
    key: song.key ?? "",
    versionName: song.versionName ?? "",
    content: song.content,
    notes: song.notes ?? "",
  };
}

function showOpenSettingsAlert(kind: PermissionKind) {
  const messages = permissionMessages[kind];
  Alert.alert(messages.blockedTitle, messages.blockedMessage, [
    { text: "Cancelar", style: "cancel" },
    {
      text: "Abrir Ajustes",
      onPress: () => {
        Linking.openSettings().catch(() => {
          Alert.alert(
            "No pudimos abrir Ajustes",
            "Abrí Ajustes manualmente y habilitá el permiso para Musum.",
          );
        });
      },
    },
  ]);
}

function showDeniedAlert(kind: PermissionKind) {
  Alert.alert("Permiso requerido", permissionMessages[kind].deniedMessage);
}

async function resolvePermission(
  kind: PermissionKind,
  getPermission: () => Promise<ImagePicker.PermissionResponse>,
  requestPermission: () => Promise<ImagePicker.PermissionResponse>,
) {
  const current = await getPermission();
  if (current.granted) return true;

  if (!current.canAskAgain) {
    showOpenSettingsAlert(kind);
    return false;
  }

  const requested = await requestPermission();
  if (requested.granted) return true;

  if (!requested.canAskAgain) {
    showOpenSettingsAlert(kind);
    return false;
  }

  showDeniedAlert(kind);
  return false;
}

export function SongFormScreen({ navigation, route }: Props) {
  const isEdit = route.params.mode === "edit";
  const isCreateVersion = route.params.mode === "createVersion";
  const needsSourceSong = isEdit || isCreateVersion;
  const headerHeight = useHeaderHeight();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const songRepository = useSongRepository();
  const [values, setValues] = useState<SongFormValues>(emptyValues);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [loading, setLoading] = useState(needsSourceSong);
  const [saving, setSaving] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songLimitReached, setSongLimitReached] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [versionSemitones, setVersionSemitones] = useState(0);
  const ocrInFlightRef = useRef(false);
  const initializedSourceRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isCreateVersion ? "Nueva versión" : isEdit ? "Editar canción" : "Nueva canción",
    });
  }, [isCreateVersion, isEdit, navigation]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!needsSourceSong) return;
    const params = route.params;
    const sourceSongId = params.mode === "edit" ? params.songId : params.sourceSongId;
    const sourceKey = `${params.mode}:${sourceSongId}`;
    if (initializedSourceRef.current === sourceKey) return;
    let mounted = true;
    songRepository.getSong(sourceSongId)
      .then((song) => {
        if (!mounted) return;
        initializedSourceRef.current = sourceKey;
        if (params.mode === "createVersion") {
          const versionValues = createVersionFormValues(song, params.initialSemitones);
          setValues({
            ...emptyValues,
            key: versionValues.key,
            versionName: versionValues.versionName,
            content: versionValues.content,
          });
          setVersionSemitones(params.initialSemitones);
          return;
        }
        setValues(valuesFromSong(song));
        setDetailsExpanded(Boolean(song.key || song.versionName || song.notes));
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "No pudimos cargar la canción."))
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [needsSourceSong, route.params, songRepository]);

  function setField(field: keyof SongFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function transposeVersion(semitones: number) {
    setValues((current) => ({
      ...current,
      ...transposeVersionFormValues(
        {
          versionName: current.versionName,
          key: current.key,
          content: current.content,
        },
        semitones,
      ),
    }));
    setVersionSemitones((current) => current + semitones);
  }

  async function save() {
    Keyboard.dismiss();
    setError(null);
    if (isCreateVersion && !values.versionName.trim()) {
      setSongLimitReached(false);
      setError("El nombre de la versión es obligatorio.");
      return;
    }
    if (!isCreateVersion && !values.title.trim()) {
      setSongLimitReached(false);
      setError("El título es obligatorio.");
      return;
    }

    setSaving(true);
    try {
      let song: SongDetail;
      if (route.params.mode === "createVersion") {
        song = await songRepository.createVersion(
          route.params.sourceSongId,
          toVersionCreateValues({
            versionName: values.versionName,
            key: values.key,
            content: values.content,
          }),
        );
      } else if (route.params.mode === "edit") {
        song = await songRepository.updateSong(route.params.songId, values);
      } else {
        song = await songRepository.createSong(values);
      }
      navigation.replace("SongDetail", { songId: song.id, title: song.title });
    } catch (reason) {
      const limitMessage = getSongLimitReachedMessage(reason);
      if (limitMessage) {
        setError(null);
        setSongLimitReached(true);
        return;
      }
      setSongLimitReached(false);
      setError(
        reason instanceof Error
          ? reason.message
          : isCreateVersion
            ? "No pudimos guardar la versión."
            : "No pudimos guardar la canción.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function runOcrFromAsset(asset: ImagePicker.ImagePickerAsset) {
    setOcrLoading(true);
    setSongLimitReached(false);
    setError(null);
    try {
      const preparedImage = await prepareOcrImage(asset);
      const text = await extractTextFromImage({
        uri: preparedImage.uri,
        fileName: preparedImage.fileName,
        mimeType: preparedImage.mimeType,
      });
      setValues((current) => ({
        ...current,
        content: appendExtractedSongContent(current.content, text),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No pudimos extraer texto de la imagen.");
    } finally {
      setOcrLoading(false);
    }
  }

  async function importImage() {
    if (ocrInFlightRef.current) return;
    if (!canUseCloudOcr(user)) {
      Alert.alert("Cuenta necesaria para OCR", CLOUD_OCR_AUTH_REQUIRED_MESSAGE, [
        {
          text: "Crear cuenta",
          onPress: () => navigation.navigate("Login"),
        },
        {
          text: "Iniciar sesión",
          onPress: () => navigation.navigate("Login", { initialMode: "form" }),
        },
        { text: "Cancelar", style: "cancel" },
      ]);
      return;
    }

    ocrInFlightRef.current = true;
    try {
      const hasPermission = await resolvePermission(
        "photos",
        () => ImagePicker.getMediaLibraryPermissionsAsync(false),
        () => ImagePicker.requestMediaLibraryPermissionsAsync(false),
      );
      if (!hasPermission) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.9,
      });
      if (!result.canceled && result.assets[0]) {
        await runOcrFromAsset(result.assets[0]);
      }
    } finally {
      ocrInFlightRef.current = false;
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.select({ ios: "padding", android: undefined })}
      keyboardVerticalOffset={headerHeight}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      >
        {isCreateVersion ? (
          <>
            <Text style={styles.label}>Nombre de la versión</Text>
            <TextInput
              value={values.versionName}
              onChangeText={(text) => setField("versionName", text)}
              style={styles.input}
              placeholder="Ej. Acústica"
              placeholderTextColor={colors.muted}
              autoCapitalize="sentences"
              maxLength={80}
            />

            <Text style={styles.label}>Tonalidad</Text>
            <TextInput
              value={values.key}
              onChangeText={(text) => setField("key", text)}
              style={styles.input}
              placeholder="Ej. Em"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={24}
            />
            <View style={styles.versionTransposeRow}>
              <Pressable
                style={styles.versionTransposeControl}
                onPress={() => transposeVersion(-1)}
                accessibilityRole="button"
                accessibilityLabel="Bajar un semitono"
              >
                <Text style={styles.versionTransposeControlText}>-</Text>
              </Pressable>
              <View style={styles.versionTransposeValue}>
                <Text style={styles.versionTransposeValueText}>
                  {versionSemitones === 0
                    ? "Original"
                    : versionSemitones > 0
                      ? `+${versionSemitones}`
                      : versionSemitones}
                </Text>
              </View>
              <Pressable
                style={styles.versionTransposeControl}
                onPress={() => transposeVersion(1)}
                accessibilityRole="button"
                accessibilityLabel="Subir un semitono"
              >
                <Text style={styles.versionTransposeControlText}>+</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>Título</Text>
            <TextInput
              value={values.title}
              onChangeText={(text) => setField("title", text)}
              style={styles.input}
              placeholder="Nombre de la canción"
              placeholderTextColor={colors.muted}
            />

            <Text style={styles.label}>Artista <Text style={styles.optionalLabel}>Opcional</Text></Text>
            <TextInput
              value={values.artist}
              onChangeText={(text) => setField("artist", text)}
              style={styles.input}
              placeholder="Opcional"
              placeholderTextColor={colors.muted}
            />
          </>
        )}

        <Text style={styles.label}>Letra y acordes</Text>
        <TextInput
          value={values.content}
          onChangeText={(text) => setField("content", text)}
          style={[styles.input, styles.contentInput]}
          multiline
          scrollEnabled
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          placeholder="Pegá o escribí acá tu letra con acordes..."
          placeholderTextColor={colors.muted}
        />
        {!isCreateVersion ? (
          <Text style={styles.contentHelp}>
            Podés corregir la letra y los acordes cuando quieras
          </Text>
        ) : null}

        {!isCreateVersion ? <View style={styles.ocrRow}>
          <Pressable style={styles.secondaryButton} onPress={() => void importImage()} disabled={ocrLoading}>
            <Text style={styles.secondaryButtonText}>Importar desde imagen</Text>
          </Pressable>
        </View> : null}
        {!isCreateVersion ? (
          <Text style={styles.contentHelp}>
            Importá una imagen por vez. Si agregás otra, su texto se suma debajo del anterior
          </Text>
        ) : null}
        {!isCreateVersion && ocrLoading ? <Text style={styles.helper}>Extrayendo texto...</Text> : null}

        {!isCreateVersion ? <Pressable
          style={({ pressed }) => [styles.detailsToggle, pressed && styles.detailsTogglePressed]}
          onPress={() => setDetailsExpanded((current) => !current)}
          accessibilityRole="button"
          accessibilityState={{ expanded: detailsExpanded }}
        >
          <View>
            <Text style={styles.detailsTitle}>Más detalles</Text>
            <Text style={styles.detailsSubtitle}>Tono, versión y notas opcionales</Text>
          </View>
          <Text style={styles.detailsChevron}>{detailsExpanded ? "−" : "+"}</Text>
        </Pressable> : null}

        {!isCreateVersion && detailsExpanded ? (
          <View style={styles.detailsPanel}>
            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Tono</Text>
                <TextInput
                  value={values.key}
                  onChangeText={(text) => setField("key", text)}
                  style={styles.input}
                  placeholder="G"
                  placeholderTextColor={colors.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>Versión</Text>
                <TextInput
                  value={values.versionName}
                  onChangeText={(text) => setField("versionName", text)}
                  style={styles.input}
                  placeholder="Principal"
                  placeholderTextColor={colors.muted}
                />
              </View>
            </View>

            <Text style={styles.label}>Notas</Text>
            <TextInput
              value={values.notes}
              onChangeText={(text) => setField("notes", text)}
              style={[styles.input, styles.notesInput]}
              multiline
              textAlignVertical="top"
              placeholder="Opcional"
              placeholderTextColor={colors.muted}
            />
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

      </ScrollView>
      <View
        style={[
          styles.footer,
          { paddingBottom: keyboardVisible ? 10 : Math.max(insets.bottom, 12) },
        ]}
      >
        {songLimitReached ? (
          <View style={styles.limitNotice} accessibilityRole="alert">
            <Text style={styles.limitNoticeText}>{SONG_LIMIT_REACHED_MESSAGE}</Text>
            <View style={styles.limitNoticeActions}>
              <Pressable
                style={({ pressed }) => [styles.limitPremiumButton, pressed && styles.limitButtonPressed]}
                onPress={() => {
                  setSongLimitReached(false);
                  navigation.navigate("Premium");
                }}
                accessibilityRole="button"
              >
                <Text style={styles.limitPremiumButtonText}>Ver Premium</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.limitEditButton, pressed && styles.limitButtonPressed]}
                onPress={() => setSongLimitReached(false)}
                accessibilityRole="button"
              >
                <Text style={styles.limitEditButtonText}>Seguir editando</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            pressed && styles.saveButtonPressed,
            (saving || ocrLoading) && styles.saveButtonDisabled,
          ]}
          onPress={() => void save()}
          disabled={saving || ocrLoading}
        >
          {saving ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.saveButtonText}>
              {isCreateVersion ? "Guardar versión" : isEdit ? "Guardar cambios" : "Guardar canción"}
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 18, paddingBottom: 24, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
  label: { color: colors.muted, fontSize: 12, fontWeight: "800", letterSpacing: 1.4, marginTop: 8 },
  optionalLabel: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  row: { flexDirection: "row", gap: 10 },
  rowItem: { flex: 1 },
  ocrRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  secondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.green, fontWeight: "800" },
  helper: { color: colors.muted },
  contentInput: { height: 340, fontFamily: "monospace", lineHeight: 22 },
  contentHelp: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  detailsToggle: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    backgroundColor: colors.surface,
    minHeight: 60,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  detailsTogglePressed: { borderColor: colors.green },
  detailsTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
  detailsSubtitle: { color: colors.muted, marginTop: 2 },
  detailsChevron: { color: colors.green, fontSize: 26, fontWeight: "900" },
  detailsPanel: { gap: 10 },
  versionTransposeRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    padding: 4,
    backgroundColor: colors.surface,
  },
  versionTransposeControl: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  versionTransposeControlText: { color: colors.text, fontSize: 23, fontWeight: "700" },
  versionTransposeValue: { minWidth: 88, height: 40, alignItems: "center", justifyContent: "center" },
  versionTransposeValueText: { color: colors.text, fontWeight: "800" },
  notesInput: { minHeight: 96 },
  error: { color: colors.danger, marginTop: 6 },
  footer: {
    alignItems: "stretch",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  limitNotice: {
    gap: 10,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 14,
    backgroundColor: colors.surface,
    padding: 12,
  },
  limitNoticeText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  limitNoticeActions: { flexDirection: "row", gap: 10 },
  limitPremiumButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  limitPremiumButtonText: { color: colors.background, fontWeight: "900" },
  limitEditButton: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  limitEditButtonText: { color: colors.text, fontWeight: "800" },
  limitButtonPressed: { opacity: 0.75 },
  saveButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: colors.green,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonPressed: { backgroundColor: colors.greenPressed },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.background, fontSize: 17, fontWeight: "900" },
});
