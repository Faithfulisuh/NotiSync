import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onGetStarted }) => {
  return (
    <ScrollView className="flex-1 bg-white">
      <View className="flex-1 px-6 py-12">
        {/* Logo/Brand */}
        <View className="items-center mb-12">
          <View className="w-24 h-24 bg-blue-600 rounded-3xl items-center justify-center mb-6">
            <Text className="text-white text-4xl font-bold">N</Text>
          </View>
          <Text className="text-3xl font-bold text-gray-900 mb-2">NotiSync</Text>
          <Text className="text-gray-500 text-center text-lg">
            Capture and sync notifications across all your devices
          </Text>
        </View>

        {/* Features */}
        <View className="mb-12">
          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-12 h-12 bg-blue-100 rounded-xl items-center justify-center mr-4">
                <Text className="text-2xl">📱</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Cross-App Capture</Text>
                <Text className="text-gray-600">Monitor notifications from all your apps</Text>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-12 h-12 bg-green-100 rounded-xl items-center justify-center mr-4">
                <Text className="text-2xl">☁️</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Cloud Sync</Text>
                <Text className="text-gray-600">Access your notifications anywhere</Text>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-12 h-12 bg-purple-100 rounded-xl items-center justify-center mr-4">
                <Text className="text-2xl">🔒</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Privacy First</Text>
                <Text className="text-gray-600">Your data is encrypted and secure</Text>
              </View>
            </View>
          </View>

          <View className="mb-6">
            <View className="flex-row items-center mb-3">
              <View className="w-12 h-12 bg-orange-100 rounded-xl items-center justify-center mr-4">
                <Text className="text-2xl">📊</Text>
              </View>
              <View className="flex-1">
                <Text className="text-lg font-semibold text-gray-900">Smart Analytics</Text>
                <Text className="text-gray-600">Understand your notification patterns</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Get Started Button */}
        <TouchableOpacity
          onPress={onGetStarted}
          className="bg-blue-600 rounded-2xl py-4 mb-4"
        >
          <Text className="text-white text-center font-semibold text-lg">
            Get Started
          </Text>
        </TouchableOpacity>

        {/* Development Note */}
        <View className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mt-4">
          <Text className="text-yellow-800 font-medium mb-2">🚧 Development Preview</Text>
          <Text className="text-yellow-700 text-sm">
            This is a development version. Cross-app notification capture is currently being implemented for Android.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
};