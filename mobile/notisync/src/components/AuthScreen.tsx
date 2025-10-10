import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { apiService } from '../services/api';
import { deviceRegistrationService } from '../services/deviceRegistration';

interface AuthScreenProps {
  onAuthSuccess: () => void;
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

    if (!isLogin) {
      if (password !== confirmPassword) {
        Alert.alert('Error', 'Passwords do not match');
        return;
      }
    }

    setLoading(true);
    try {
      let result;

      if (isLogin) {
        result = await apiService.login({ email, password });
      } else {
        result = await apiService.register({
          email,
          password,
          firstName: '', // Not required by backend
          lastName: '' // Not required by backend
        });
      }

      if (result.success) {
        // Automatically transition to next screen first
        console.log('Login successful, calling onAuthSuccess callback');
        onAuthSuccess();
        
        // Show success message without blocking the transition
        Alert.alert(
          'Success!',
          isLogin ? 'Successfully logged in!' : 'Account created and logged in!'
        );

        // Ensure device is registered after successful authentication (in background)
        setTimeout(async () => {
          // TODO: Re-enable device registration after cross-app notification capture is implemented
          // try {
          //   console.log('Authentication successful, ensuring device registration...');
          //   const deviceResult = await deviceRegistrationService.ensureDeviceRegistration();
          //   
          //   if (deviceResult.success) {
          //     console.log('Device registration ensured successfully');
          //   } else {
          //     console.warn('Device registration failed:', deviceResult.error);
          //   }
          // } catch (deviceError) {
          //   console.warn('Device registration error:', deviceError);
          // }
        }, 100); // Small delay to ensure transition happens first
      } else {
        Alert.alert('Error', result.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
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

      {/* Debug buttons */}
      <View className="mt-4 space-y-2">
        <TouchableOpacity
          className="py-2"
          onPress={async () => {
            await apiService.clearAllStoredData();
            Alert.alert('Debug', 'All stored data cleared. You can now register/login fresh.');
          }}
        >
          <Text className="text-red-500 text-center font-pregular text-sm">
            [Debug] Clear All Data
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="py-2"
          onPress={async () => {
            if (!apiService.isAuthenticated()) {
              Alert.alert('Debug', 'Please login first');
              return;
            }
            
            const status = await deviceRegistrationService.checkRegistrationStatus();
            Alert.alert('Device Status', JSON.stringify(status, null, 2));
          }}
        >
          <Text className="text-blue-500 text-center font-pregular text-sm">
            [Debug] Check Device Status
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="py-2"
          onPress={async () => {
            if (!apiService.isAuthenticated()) {
              Alert.alert('Debug', 'Please login first');
              return;
            }
            
            const result = await deviceRegistrationService.forceReregister();
            Alert.alert('Force Re-register', result.success ? 'Success!' : result.error || 'Failed');
          }}
        >
          <Text className="text-green-500 text-center font-pregular text-sm">
            [Debug] Force Re-register Device
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};