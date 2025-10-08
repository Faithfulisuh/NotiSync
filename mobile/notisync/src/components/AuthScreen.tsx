import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';

interface AuthScreenProps {
  onAuthSuccess: (token: string) => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      // TODO: Replace with actual API call
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(`http://localhost:8080${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();
      
      if (response.ok) {
        onAuthSuccess(data.token);
      } else {
        Alert.alert('Error', data.message || 'Authentication failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View className="flex-1 justify-center p-6 bg-white">
      <Text className="text-3xl font-pbold text-center mb-8 text-slate-800">
        {isLogin ? 'Welcome Back' : 'Create Account'}
      </Text>
      
      <View className="mb-4">
        <Text className="text-sm font-pmedium mb-2 text-slate-700">Email</Text>
        <TextInput
          className="border border-gray-300 rounded-lg p-3 text-base"
          value={email}
          onChangeText={setEmail}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View className="mb-4">
        <Text className="text-sm font-pmedium mb-2 text-slate-700">Password</Text>
        <TextInput
          className="border border-gray-300 rounded-lg p-3 text-base"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry
        />
      </View>

      {!isLogin && (
        <View className="mb-6">
          <Text className="text-sm font-pmedium mb-2 text-slate-700">Confirm Password</Text>
          <TextInput
            className="border border-gray-300 rounded-lg p-3 text-base"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Confirm your password"
            secureTextEntry
          />
        </View>
      )}

      <TouchableOpacity
        className={`py-3 rounded-lg mb-4 ${loading ? 'bg-gray-400' : 'bg-blue-600'}`}
        onPress={handleAuth}
        disabled={loading}
      >
        <Text className="text-white text-center font-pmedium text-base">
          {loading ? 'Please wait...' : (isLogin ? 'Sign In' : 'Create Account')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        className="py-2"
        onPress={() => setIsLogin(!isLogin)}
      >
        <Text className="text-blue-600 text-center font-pregular">
          {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
        </Text>
      </TouchableOpacity>
    </View>
  );
};