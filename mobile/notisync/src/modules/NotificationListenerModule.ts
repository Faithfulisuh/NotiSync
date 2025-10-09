import { NativeModulesProxy } from 'expo-modules-core';
import { Platform } from 'react-native';

// Get the native module from NativeModulesProxy
const NotificationListenerModule = NativeModulesProxy.NotificationListener;

export default NotificationListenerModule ? NotificationListenerModule : new Proxy(
  {},
  {
    get() {
      throw new Error(
        `The native module 'NotificationListener' doesn't seem to be linked. Make sure: \n\n` +
        Platform.select({ ios: "- You have run 'pod install'\n", default: '' }) +
        '- You rebuilt the app after installing the package\n' +
        '- You are not using Expo managed workflow\n'
      );
    },
  }
);