import React from "react";
import { ScrollView, View, Text, Platform } from "react-native";
import { NotificationCaptureTest } from "../components/NotificationCaptureTest";
import { SafeAreaView } from "react-native-safe-area-context";
import "../utils/webPolyfills"; // Import web polyfills

const TestPage = () => {
  return (
    <SafeAreaView>
      <ScrollView className="flex-1">
        <View className="p-5">
          <Text className="text-2xl font-pbold mb-2 text-slate-800">
            🧪 Advanced Testing
          </Text>
          <Text className="text-base font-pregular text-slate-600 mb-5">
            Platform: {Platform.OS} | Version: {Platform.Version}
          </Text>
          <Text className="text-sm font-pregular text-slate-600 mb-5">
            This page provides advanced testing and debugging tools for notification capture.
          </Text>
        </View>

        {Platform.OS !== 'web' ? (
          <NotificationCaptureTest />
        ) : (
          <View className="p-5">
            <View className="bg-yellow-50 p-4 rounded-lg border-l-4 border-yellow-400">
              <Text className="text-base font-psemibold mb-2 text-slate-800">
                ⚠️ Web Platform Limitation
              </Text>
              <Text className="text-sm font-pregular text-slate-600">
                Advanced notification testing is only available on mobile platforms. 
                The web version is limited to basic functionality.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default TestPage;