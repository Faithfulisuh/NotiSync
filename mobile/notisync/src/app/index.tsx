import { Link } from "expo-router";
import { View, Text } from "react-native";

const Index = () => {
  return (
    <View className="flex-1 items-center justify-center p-6">
      <Text className="text-3xl font-pbold mb-2">Welcome to NotiSync</Text>
      <Text className="text-gray-500 mb-4 text-center font-pmedium">
        Discover and collaborate on NotiSync.
      </Text>

      <Link
        href="/"
        className="bg-black text-white px-4 py-2 rounded-md text-sm"
      >
        Explore
      </Link>
    </View>
  );
};

export default Index;
