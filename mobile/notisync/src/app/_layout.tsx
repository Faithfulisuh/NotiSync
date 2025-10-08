import "../global.css";
import { ActivityIndicator, Text, View } from "react-native";
import { SplashScreen, Stack } from "expo-router";
import { useFonts } from "expo-font";
import { Suspense, useEffect } from "react";
import { GestureHandlerWrapper } from "../components/GestureHandlerWrapper";

// RootLayout component serves as the main layout for the application
const RootLayout = () => {
  const [fontsLoaded, error] = useFonts({
    "pblack": require("../assets/fonts/Poppins-Black.ttf"),
    "pbold": require("../assets/fonts/Poppins-Bold.ttf"),
    "pextrabold": require("../assets/fonts/Poppins-ExtraBold.ttf"),
    "pextralight": require("../assets/fonts/Poppins-ExtraLight.ttf"),
    "plight": require("../assets/fonts/Poppins-Light.ttf"),
    "pmedium": require("../assets/fonts/Poppins-Medium.ttf"),
    "pregular": require("../assets/fonts/Poppins-Regular.ttf"),
    "psemibold": require("../assets/fonts/Poppins-SemiBold.ttf"),
    "pthin": require("../assets/fonts/Poppins-Thin.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded, error]);

  if (!fontsLoaded && !error) return null;

  return (
    <GestureHandlerWrapper style={{ flex: 1 }}>
      <Suspense
        fallback={
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size={"large"} />
            <Text>Loading...</Text>
          </View>
        }
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
      </Suspense>
    </GestureHandlerWrapper>
  );
};

export default RootLayout;
