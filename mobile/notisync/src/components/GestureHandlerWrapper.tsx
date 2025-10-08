import React from 'react';
import { View, Platform } from 'react-native';

// Web-compatible wrapper for GestureHandlerRootView
let GestureHandlerRootView: React.ComponentType<any> = View;

if (Platform.OS !== 'web') {
  try {
    const { GestureHandlerRootView: NativeGestureHandler } = require('react-native-gesture-handler');
    GestureHandlerRootView = NativeGestureHandler;
  } catch (error) {
    console.warn('react-native-gesture-handler not available, using View fallback');
  }
}

interface GestureHandlerWrapperProps {
  children: React.ReactNode;
  style?: any;
}

export const GestureHandlerWrapper: React.FC<GestureHandlerWrapperProps> = ({ children, style }) => {
  return (
    <GestureHandlerRootView style={style}>
      {children}
    </GestureHandlerRootView>
  );
};