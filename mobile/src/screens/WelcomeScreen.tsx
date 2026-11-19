import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useRef, useState } from "react";
import {
  FlatList,
  Image,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import type { RootStackParamList } from "../types";
import { markOnboardingCompleted } from "../utils/onboarding";
import {
  clampOnboardingPage,
  getOnboardingPresentation,
  getOnboardingPrimaryAction,
} from "../utils/onboardingPresentation";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

const onboardingSlides = [
  {
    id: "import",
    image: require("../../assets/musum_onboarding_1.png"),
    accessibilityLabel: "Tus canciones listas para tocar. Importá una imagen o pegá una letra con acordes.",
  },
  {
    id: "follow",
    image: require("../../assets/musum_onboarding_2.png"),
    accessibilityLabel: "Musum te sigue mientras tocás. Tocá a tu ritmo. La canción avanza con vos.",
  },
  {
    id: "library",
    image: require("../../assets/musum_onboarding_3.png"),
    accessibilityLabel: "Tu repertorio siempre con vos. Guardá tus canciones, cambiá el tono y volvé a tocarlas cuando quieras.",
  },
] as const;

export function WelcomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const listRef = useRef<FlatList<(typeof onboardingSlides)[number]> | null>(null);
  const finishingRef = useRef(false);
  const previousTabletPageWidthRef = useRef(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [tabletPageWidth, setTabletPageWidth] = useState(0);
  const isPad = Platform.OS === "ios" && Platform.isPad;
  const presentation = getOnboardingPresentation(isPad, width, height);
  const isLastPage = pageIndex === onboardingSlides.length - 1;

  async function finishOnboarding() {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await markOnboardingCompleted().catch(() => undefined);
    navigation.replace("Library");
  }

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const pageWidth = presentation.controls === "native" ? tabletPageWidth : width;
    if (pageWidth <= 0) return;

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setPageIndex(clampOnboardingPage(nextIndex, onboardingSlides.length));
  }

  function showPage(nextPageIndex: number) {
    const nextIndex = clampOnboardingPage(nextPageIndex, onboardingSlides.length);
    const pageWidth = presentation.controls === "native" ? tabletPageWidth : width;
    setPageIndex(nextIndex);
    listRef.current?.scrollToOffset({ offset: nextIndex * pageWidth, animated: true });
  }

  useEffect(() => {
    if (presentation.controls !== "native" || tabletPageWidth <= 0) return;

    const previousWidth = previousTabletPageWidthRef.current;
    previousTabletPageWidthRef.current = tabletPageWidth;
    if (previousWidth <= 0 || Math.abs(previousWidth - tabletPageWidth) < 1) return;

    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: pageIndex * tabletPageWidth,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [pageIndex, presentation.controls, tabletPageWidth]);

  if (presentation.controls === "native") {
    const isLandscape = presentation.layout === "tablet-landscape";
    const primaryAction = getOnboardingPrimaryAction(pageIndex, onboardingSlides.length);

    return (
      <View
        style={[
          styles.root,
          styles.tabletSafeArea,
          {
            paddingTop: insets.top + 18,
            paddingRight: insets.right + 22,
            paddingBottom: insets.bottom + 18,
            paddingLeft: insets.left + 22,
          },
        ]}
      >
        <View style={[styles.tabletLayout, isLandscape ? styles.tabletLandscape : styles.tabletPortrait]}>
          <View
            style={styles.tabletArtworkFrame}
            onLayout={(event) => {
              const nextWidth = event.nativeEvent.layout.width;
              setTabletPageWidth((currentWidth) =>
                Math.abs(currentWidth - nextWidth) >= 1 ? nextWidth : currentWidth,
              );
            }}
          >
            {tabletPageWidth > 0 ? (
              <FlatList
                ref={listRef}
                data={onboardingSlides}
                keyExtractor={(item) => item.id}
                horizontal
                pagingEnabled
                bounces={false}
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleScrollEnd}
                getItemLayout={(_, index) => ({
                  length: tabletPageWidth,
                  offset: tabletPageWidth * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <View style={[styles.tabletSlide, { width: tabletPageWidth }]}>
                    <Image
                      source={item.image}
                      resizeMode={presentation.imageResizeMode}
                      style={styles.tabletImage}
                      accessibilityLabel={item.accessibilityLabel}
                    />
                  </View>
                )}
              />
            ) : null}
          </View>

          <ScrollView
            style={[
              styles.tabletControls,
              isLandscape
                ? { width: Math.min(360, Math.max(300, width * 0.28)) }
                : { maxHeight: Math.min(330, Math.max(260, height * 0.3)) },
            ]}
            contentContainerStyle={styles.tabletControlsContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.tabletControlsHeader}>
              <View>
                <Text style={styles.tabletBrand}>Musum</Text>
                <Text style={styles.tabletProgress} accessibilityLiveRegion="polite">
                  Pantalla {pageIndex + 1} de {onboardingSlides.length}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Omitir presentación e ir a Biblioteca"
                hitSlop={8}
                style={({ pressed }) => [styles.tabletTextButton, pressed && styles.pressed]}
                onPress={() => void finishOnboarding()}
              >
                <Text style={styles.tabletTextButtonLabel}>Omitir</Text>
              </Pressable>
            </View>

            <View
              accessible
              accessibilityLabel={`Página ${pageIndex + 1} de ${onboardingSlides.length}`}
              style={styles.tabletDots}
            >
              {onboardingSlides.map((slide, index) => (
                <View
                  key={slide.id}
                  style={[styles.tabletDot, index === pageIndex && styles.tabletDotActive]}
                />
              ))}
            </View>

            <View style={styles.tabletActions}>
              {pageIndex > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Volver a la pantalla anterior"
                  style={({ pressed }) => [styles.tabletSecondaryButton, pressed && styles.pressed]}
                  onPress={() => showPage(pageIndex - 1)}
                >
                  <Text style={styles.tabletSecondaryButtonLabel}>Anterior</Text>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  primaryAction === "finish"
                    ? "Empezar a usar Musum y abrir Biblioteca"
                    : "Avanzar a la pantalla siguiente"
                }
                style={({ pressed }) => [styles.tabletPrimaryButton, pressed && styles.pressed]}
                onPress={() => {
                  if (primaryAction === "finish") {
                    void finishOnboarding();
                    return;
                  }
                  showPage(pageIndex + 1);
                }}
              >
                <Text style={styles.tabletPrimaryButtonLabel}>
                  {primaryAction === "finish" ? "Empezar y abrir Biblioteca" : "Siguiente"}
                </Text>
              </Pressable>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Ya tengo cuenta. Iniciar sesión"
              style={({ pressed }) => [styles.tabletSignInButton, pressed && styles.pressed]}
              onPress={() => navigation.navigate("Login", { fromWelcome: true })}
            >
              <Text style={styles.tabletSignInLabel}>Ya tengo cuenta · Iniciar sesión</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={onboardingSlides}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleScrollEnd}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        renderItem={({ item }) => (
          <ImageBackground
            source={item.image}
            resizeMode="cover"
            style={[styles.slide, { width, minHeight: height }]}
            accessibilityLabel={item.accessibilityLabel}
          />
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Ya tengo cuenta. Iniciar sesión"
        style={[styles.signInHitArea, { bottom: insets.bottom + (isLastPage ? 0 : 18) }]}
        onPress={() => navigation.navigate("Login", { fromWelcome: true })}
      />

      {isLastPage ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Empezar"
          style={styles.startHitArea}
          onPress={() => void finishOnboarding()}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  slide: { flex: 1 },
  tabletSafeArea: {
    flex: 1,
  },
  tabletLayout: {
    flex: 1,
    gap: 18,
  },
  tabletLandscape: {
    flexDirection: "row",
  },
  tabletPortrait: {
    flexDirection: "column",
  },
  tabletArtworkFrame: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    backgroundColor: "#000000",
  },
  tabletSlide: {
    flex: 1,
    padding: 10,
  },
  tabletImage: {
    width: "100%",
    height: "100%",
  },
  tabletControls: {
    flexGrow: 0,
    flexShrink: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    backgroundColor: colors.surface,
  },
  tabletControlsContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    gap: 18,
    padding: 22,
  },
  tabletControlsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  tabletBrand: {
    color: colors.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  tabletProgress: {
    marginTop: 4,
    color: colors.muted,
    fontSize: 16,
  },
  tabletTextButton: {
    minHeight: 48,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  tabletTextButtonLabel: {
    color: colors.greenPressed,
    fontSize: 17,
    fontWeight: "700",
  },
  tabletDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
  },
  tabletDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  tabletDotActive: {
    width: 28,
    backgroundColor: colors.green,
  },
  tabletActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tabletPrimaryButton: {
    flexGrow: 1,
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: colors.green,
  },
  tabletPrimaryButtonLabel: {
    color: "#020617",
    fontSize: 17,
    fontWeight: "800",
    textAlign: "center",
  },
  tabletSecondaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    backgroundColor: colors.surfaceStrong,
  },
  tabletSecondaryButtonLabel: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "700",
  },
  tabletSignInButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    borderRadius: 18,
  },
  tabletSignInLabel: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
  },
  signInHitArea: {
    position: "absolute",
    left: 54,
    right: 54,
    minHeight: 48,
  },
  startHitArea: {
    position: "absolute",
    left: 34,
    right: 34,
    bottom: 50,
    minHeight: 76,
    borderRadius: 22,
  },
});
