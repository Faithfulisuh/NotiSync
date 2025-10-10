import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { apiService } from '../services/api';

interface SignUpScreenProps {
  onSignUpSuccess: () => void;
  onSwitchToSignIn: () => void;
}

export const SignUpScreen: React.FC<SignUpScreenProps> = ({ onSignUpSuccess, onSwitchToSignIn }) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignUp = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);
    try {
      const result = await apiService.register({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      
      if (result.success) {
        console.log('Registration successful, calling onSignUpSuccess callback');
        onSignUpSuccess();
      } else {
        Alert.alert('Error', result.error || 'Sign up failed');
      }
    } catch (error) {
      console.error('Sign up error:', error);
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
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
        <View className="flex-1 justify-center px-6 py-8">
          {/* Logo/Brand */}
          <View className="items-center mb-8">
            <View className="w-16 h-16 bg-blue-600 rounded-2xl items-center justify-center mb-4">
              <Text className="text-white text-2xl font-bold">N</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-900">Create account</Text>
            <Text className="text-gray-500 mt-2">Join NotiSync today</Text>
          </View>

          {/* Name Inputs */}
          <View className="flex-row mb-4 space-x-3">
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">First Name</Text>
              <TextInput
                value={firstName}
                onChangeText={setFirstName}
                placeholder="First name"
                autoCapitalize="words"
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-900"
              />
            </View>
            <View className="flex-1">
              <Text className="text-gray-700 font-medium mb-2">Last Name</Text>
              <TextInput
                value={lastName}
                onChangeText={setLastName}
                placeholder="Last name"
                autoCapitalize="words"
                className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-900"
              />
            </View>
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
          <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-2">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Create a password"
              secureTextEntry
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-900"
            />
          </View>

          {/* Confirm Password Input */}
          <View className="mb-6">
            <Text className="text-gray-700 font-medium mb-2">Confirm Password</Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              secureTextEntry
              className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-4 text-gray-900"
            />
          </View>

          {/* Sign Up Button */}
          <TouchableOpacity
            onPress={handleSignUp}
            disabled={isLoading}
            className={`rounded-xl py-4 mb-4 ${
              isLoading ? 'bg-gray-400' : 'bg-blue-600'
            }`}
          >
            <Text className="text-white text-center font-semibold text-lg">
              {isLoading ? 'Creating account...' : 'Create account'}
            </Text>
          </TouchableOpacity>

          {/* Divider */}
          <View className="flex-row items-center mb-4">
            <View className="flex-1 h-px bg-gray-200" />
            <Text className="mx-4 text-gray-500">or</Text>
            <View className="flex-1 h-px bg-gray-200" />
          </View>

          {/* Social Sign Up Buttons */}
          <TouchableOpacity className="bg-gray-50 border border-gray-200 rounded-xl py-4 mb-3">
            <Text className="text-gray-700 text-center font-medium">Continue with Google</Text>
          </TouchableOpacity>

          <TouchableOpacity className="bg-gray-50 border border-gray-200 rounded-xl py-4 mb-6">
            <Text className="text-gray-700 text-center font-medium">Continue with Apple</Text>
          </TouchableOpacity>

          {/* Switch to Sign In */}
          <View className="flex-row justify-center">
            <Text className="text-gray-500">Already have an account? </Text>
            <TouchableOpacity onPress={onSwitchToSignIn}>
              <Text className="text-blue-600 font-medium">Sign in</Text>
            </TouchableOpacity>
          </View>

          {/* Terms */}
          <Text className="text-xs text-gray-400 text-center mt-6 leading-4">
            By creating an account, you agree to our Terms of Service and Privacy Policy
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};