import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { apiService } from '../services/api';

interface SignInScreenProps {
  onSignInSuccess: () => void;
  onSwitchToSignUp: () => void;
}

export const SignInScreen: React.FC<SignInScreenProps> = ({ onSignInSuccess, onSwitchToSignUp }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiService.login({ email: email.trim(), password });
      
      if (result.success) {
        console.log('Login successful, calling onSignInSuccess callback');
        onSignInSuccess();
      } else {
        Alert.alert('Error', result.error || 'Sign in failed');
      }
    } catch (error) {
      console.error('Sign in error:', error);
      Alert.alert('Error', 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        {/* Logo/Brand */}
        <View className="items-center mb-12">
          <View className="w-16 h-16 bg-blue-600 rounded-2xl items-center justify-center mb-4">
            <Text className="text-white text-2xl font-bold">N</Text>
          </View>
          <Text className="text-2xl font-bold text-gray-900">Welcome back</Text>
          <Text className="text-gray-500 mt-2">Sign in to your account</Text>
        </View>

        {/* Email Input */}
        <View className="mb-4">
          <Text className="text-gray-700 font-medium mb-2">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-900"
          />
        </View>

        {/* Password Input */}
        <View className="mb-6">
          <Text className="text-gray-700 font-medium mb-2">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry
            className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-900"
          />
        </View>

        {/* Sign In Button */}
        <TouchableOpacity
          onPress={handleSignIn}
          disabled={isLoading}
          className={`rounded-xl py-4 mb-4 ${
            isLoading ? 'bg-gray-400' : 'bg-blue-600'
          }`}
        >
          <Text className="text-white text-center font-semibold text-lg">
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Text>
        </TouchableOpacity>

        {/* Divider */}
        <View className="flex-row items-center mb-4">
          <View className="flex-1 h-px bg-gray-200" />
          <Text className="mx-4 text-gray-500">or</Text>
          <View className="flex-1 h-px bg-gray-200" />
        </View>

        {/* Social Sign In Buttons */}
        <TouchableOpacity className="bg-gray-50 border border-gray-200 rounded-xl py-4 mb-3">
          <Text className="text-gray-700 text-center font-medium">Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity className="bg-gray-50 border border-gray-200 rounded-xl py-4 mb-6">
          <Text className="text-gray-700 text-center font-medium">Continue with Apple</Text>
        </TouchableOpacity>

        {/* Switch to Sign Up */}
        <View className="flex-row justify-center">
          <Text className="text-gray-500">Don't have an account? </Text>
          <TouchableOpacity onPress={onSwitchToSignUp}>
            <Text className="text-blue-600 font-medium">Sign up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};