import React from 'react';
import { View, Text, Platform } from 'react-native';

export const ErrorTest: React.FC = () => {
  return (
    <View className="p-5 bg-gray-100 m-2.5 rounded-lg">
      <Text className="text-lg font-pbold mb-2.5 text-slate-800">
        🔧 System Status
      </Text>
      <Text className="mb-1 font-pregular text-gray-600">
        Platform: {Platform.OS}
      </Text>
      <Text className="mb-1 font-pregular text-gray-600">
        Version: {Platform.Version}
      </Text>
      <Text className="text-green-600 font-pmedium">
        ✅ All systems operational!
      </Text>
    </View>
  );
};