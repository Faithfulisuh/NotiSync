import React, { useState } from "react";
import { Platform, ScrollView, View, Text, TouchableOpacity } from "react-native";
import "../utils/webPolyfills"; // Import web polyfills
import { ErrorTest } from "../components/ErrorTest";
import { NotificationSetup } from "../components/NotificationSetup";
import { NotificationDashboard } from "../components/NotificationDashboard";
import { WebTestMode } from "../components/WebTestMode";
import { SettingsScreen } from "../components/SettingsScreen";

const VIEWS = {
  SETUP: 'setup',
  DASHBOARD: 'dashboard',
  SETTINGS: 'settings',
} as const;

type ViewType = (typeof VIEWS)[keyof typeof VIEWS];

const Index = () => {
  const [currentView, setCurrentView] = useState<ViewType>(VIEWS.SETUP);

  if (currentView === VIEWS.DASHBOARD) {
    return <NotificationDashboard />;
  }

  if (currentView === VIEWS.SETTINGS) {
    return <SettingsScreen onBack={() => setCurrentView(VIEWS.SETUP)} />;
  }

  return (
    <ScrollView className="flex-1">
      <ErrorTest />

      <View className="p-5">
        <Text className="text-lg font-pbold mb-2.5 text-center text-slate-800">
          🎉 NotiSync Ready!
        </Text>
        <Text className="text-center mb-2.5 text-gray-600 text-sm font-pregular">
          Platform: {Platform.OS}
        </Text>
        <Text className="text-center mb-5 text-slate-700 text-base font-pregular">
          Your notification sync app is ready to use.
        </Text>

        {Platform.OS === "web" ? (
          <WebTestMode />
        ) : (
          <View className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500 mb-5">
            <Text className="text-base font-psemibold mb-2.5 text-slate-800">
              📱 Native Platform Detected
            </Text>
            <Text className="text-sm text-slate-600 mb-1 font-pregular">
              • Full notification capture available
            </Text>
            <Text className="text-sm text-slate-600 mb-1 font-pregular">
              • Background tasks supported
            </Text>
            <Text className="text-sm text-slate-600 mb-1 font-pregular">
              • Push notifications enabled
            </Text>
            <Text className="text-sm text-slate-600 font-pregular">
              • All features fully functional
            </Text>
          </View>
        )}

        {/* Navigation */}
        <View className="flex-row space-x-2 mb-5">
          <TouchableOpacity
            onPress={() => setCurrentView(VIEWS.SETUP)}
            className={`flex-1 py-3 px-3 rounded-lg ${currentView === VIEWS.SETUP
              ? 'bg-blue-600'
              : 'bg-gray-200'
              }`}
          >
            <Text className={`text-center font-medium text-sm ${currentView === VIEWS.SETUP
              ? 'text-white'
              : 'text-gray-700'
              }`}>
              Setup
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCurrentView(VIEWS.DASHBOARD)}
            className={`flex-1 py-3 px-3 rounded-lg ${currentView === VIEWS.DASHBOARD
              ? 'bg-blue-600'
              : 'bg-gray-200'
              }`}
          >
            <Text className={`text-center font-medium text-sm ${currentView === VIEWS.DASHBOARD
              ? 'text-white'
              : 'text-gray-700'
              }`}>
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCurrentView(VIEWS.SETTINGS)}
            className={`flex-1 py-3 px-3 rounded-lg ${currentView === VIEWS.SETTINGS
              ? 'bg-blue-600'
              : 'bg-gray-200'
              }`}
          >
            <Text className={`text-center font-medium text-sm ${currentView === VIEWS.SETTINGS
              ? 'text-white'
              : 'text-gray-700'
              }`}>
              Settings
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Show notification setup interface on all platforms */}
      <NotificationSetup />
    </ScrollView>
  );
};

export default Index;
