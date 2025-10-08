import React from 'react';
import { View, Text } from 'react-native';

export const WebTestMode: React.FC = () => {
  return (
    <View className="p-5 bg-gray-50">
      <Text className="text-xl font-pbold mb-1 text-slate-800">🌐 Web Platform</Text>
      <Text className="text-base font-pregular text-gray-600 mb-5">Browser-based notification sync</Text>
      
      <View className="bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400">
        <Text className="text-base font-psemibold mb-2.5 text-slate-800">ℹ️ Web Platform Limitations:</Text>
        <Text className="text-sm font-pregular text-slate-600 mb-1">• Real notification capture doesn't work in web browsers</Text>
        <Text className="text-sm font-pregular text-slate-600 mb-1">• Limited to manual notification management</Text>
        <Text className="text-sm font-pregular text-slate-600 mb-1">• Server connection and API calls work normally</Text>
        <Text className="text-sm font-pregular text-slate-600">• Install on a mobile device for full functionality</Text>
      </View>
    </View>
  );
};

