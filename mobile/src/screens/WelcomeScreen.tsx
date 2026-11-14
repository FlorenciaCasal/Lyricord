import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useRef, useState } from "react";
import {
  FlatList,
  ImageBackground,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../theme";
import type { RootStackParamList } from "../types";
import { markOnboardingCompleted } from "../utils/onboarding";

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
  const [pageIndex, setPageIndex] = useState(0);
  const isLastPage = pageIndex === onboardingSlides.length - 1;

  async function finishOnboarding() {
    await markOnboardingCompleted().catch(() => undefined);
    navigation.replace("Library");
  }

  function handleScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / width);
    setPageIndex(Math.max(0, Math.min(nextIndex, onboardingSlides.length - 1)));
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
