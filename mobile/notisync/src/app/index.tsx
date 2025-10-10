import React, { useState, useEffect } from "react";
import { Platform, ScrollView, View, Text, TouchableOpacity } from "react-native";
import "../utils/webPolyfills"; // Import web polyfills
import { ErrorTest } from "../components/ErrorTest";
import { NotificationSetup } from "../components/NotificationSetup";
import { NotificationDashboard } from "../components/NotificationDashboard";
import { WebTestMode } from "../components/WebTestMode";
import { SettingsScreen } from "../components/SettingsScreen";
import { AuthScreen } from "../components/AuthScreen";
import { apiService } from "../services/api";

const VIEWS = {
  AUTH: 'auth',
  SETUP: 'setup',
  DASHBOARD: 'dashboard',
  SETTINGS: 'settings',
} as const;

type ViewType = (typeof VIEWS)[keyof typeof VIEWS];

const Index = () => {
  const [currentView, setCurrentView] = useState<ViewType>(VIEWS.AUTH);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // Debug: Log state changes
  useEffect(() => {
    console.log('State changed:', { currentView, isAuthenticated, authLoading });
  }, [currentView, isAuthenticated, authLoading]);

  useEffect(() => {
    // Check authentication status on app start
    const checkAuth = async () => {
      try {
        console.log('App startup: Checking authentication...');
        const authState = apiService.getAuthState();
        const authenticated = apiService.isAuthenticated();
        
        console.log('App startup auth check:', {
          authenticated,
          hasTokens: !!authState.tokens,
          hasUser: !!authState.user,
          lastAuthAttempt: authState.lastAuthAttempt
        });
        
        setIsAuthenticated(authenticated);
        
        if (authenticated) {
          console.log('User is authenticated, showing setup screen');
          setCurrentView(VIEWS.SETUP);
        } else if (authState.lastAuthAttempt) {
          // User has tried to authenticate before but failed/expired
          console.log('Showing auth screen due to previous failed attempt');
          setCurrentView(VIEWS.AUTH);
        } else {
          console.log('No authentication found, showing auth screen');
          setCurrentView(VIEWS.AUTH);
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setAuthLoading(false);
      }
    };

    checkAuth();

    // Temporarily disable periodic auth check to debug login issue
    // const authCheckInterval = setInterval(() => {
    //   const authenticated = apiService.isAuthenticated();
    //   console.log('Periodic auth check:', { 
    //     currentlyAuthenticated: isAuthenticated, 
    //     apiServiceAuthenticated: authenticated,
    //     currentView 
    //   });
    //   
    //   if (isAuthenticated && !authenticated) {
    //     console.log('Authentication lost, redirecting to auth screen');
    //     setIsAuthenticated(false);
    //     setCurrentView(VIEWS.AUTH);
    //   }
    // }, 10000);

    // return () => clearInterval(authCheckInterval);
  }, [isAuthenticated]);

  const handleAuthSuccess = async () => {
    console.log('handleAuthSuccess called - transitioning to setup screen');
    console.log('Current state before update:', { isAuthenticated, currentView });
    
    // Force state updates
    setIsAuthenticated(true);
    setCurrentView(VIEWS.SETUP);
    
    console.log('State update called - should transition to SETUP view');
    
    // Wait a bit to ensure authentication state is fully propagated
    setTimeout(async () => {
      try {
        console.log('Authentication successful, ensuring device registration...');
        console.log('Auth state before device registration:', {
          isAuthenticated: apiService.isAuthenticated(),
          hasToken: !!apiService.getAccessToken(),
          authState: apiService.getAuthState()
        });
        
        const { deviceRegistrationService } = await import('../services/deviceRegistration');
        const result = await deviceRegistrationService.ensureDeviceRegistration();
        
        if (result.success) {
          console.log('Device registration successful');
        } else {
          console.warn('Device registration failed:', result.error);
        }
      } catch (error) {
        console.error('Device registration error:', error);
      }
    }, 1000); // Wait 1 second for auth state to stabilize
  };

  const handleLogout = async () => {
    await apiService.logout();
    setIsAuthenticated(false);
    setCurrentView(VIEWS.AUTH);
  };

  if (authLoading) {
    return (
      <View className="flex-1 justify-center items-center">
        <Text className="text-lg font-pmedium">Loading...</Text>
      </View>
    );
  }

  // Show auth screen if not authenticated and user is trying to access auth-required features
  if (currentView === VIEWS.AUTH) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} />;
  }

  if (currentView === VIEWS.DASHBOARD) {
    return <NotificationDashboard />;
  }

  if (currentView === VIEWS.SETTINGS) {
    return <SettingsScreen onBack={() => setCurrentView(VIEWS.SETUP)} />;
  }

  return (
    <ScrollView className="flex-1">
      <ErrorTest />

      <View className="p-5">
        <Text className="text-lg font-pbold mb-2.5 text-center text-slate-800">
          🎉 NotiSync Ready!
        </Text>
        <Text className="text-center mb-2.5 text-gray-600 text-sm font-pregular">
          Platform: {Platform.OS}
        </Text>
        <Text className="text-center mb-5 text-slate-700 text-base font-pregular">
          Your notification sync app is ready to use.
        </Text>

        {Platform.OS === "web" ? (
          <WebTestMode />
        ) : (
          <View className="bg-green-50 p-4 rounded-lg border-l-4 border-green-500 mb-5">
            <Text className="text-base font-psemibold mb-2.5 text-slate-800">
              📱 Native Platform Detected
            </Text>
            <Text className="text-sm text-slate-600 mb-1 font-pregular">
              • Full notification capture available
            </Text>
            <Text className="text-sm text-slate-600 mb-1 font-pregular">
              • Background tasks supported
            </Text>
            <Text className="text-sm text-slate-600 mb-1 font-pregular">
              • Push notifications enabled
            </Text>
            <Text className="text-sm text-slate-600 font-pregular">
              • All features fully functional
            </Text>
          </View>
        )}

        {/* Authentication Status */}
        <View className="mb-4 p-3 bg-gray-50 rounded-lg">
          <View className="flex-row justify-between items-center">
            <Text className="text-sm font-pmedium text-slate-700">
              {isAuthenticated ? '🟢 Authenticated' : '🔴 Not Authenticated'}
            </Text>
            <TouchableOpacity
              onPress={isAuthenticated ? handleLogout : () => setCurrentView(VIEWS.AUTH)}
              className={`px-3 py-1 rounded ${isAuthenticated ? 'bg-red-100' : 'bg-blue-100'}`}
            >
              <Text className={`text-xs font-pmedium ${isAuthenticated ? 'text-red-700' : 'text-blue-700'}`}>
                {isAuthenticated ? 'Logout' : 'Login'}
              </Text>
            </TouchableOpacity>
          </View>
          {isAuthenticated && (
            <Text className="text-xs text-slate-500 mt-1">
              Device registration and sync available
            </Text>
          )}
        </View>

        {/* Navigation */}
        <View className="flex-row space-x-2 mb-5">
          <TouchableOpacity
            onPress={() => setCurrentView(VIEWS.SETUP)}
            className={`flex-1 py-3 px-3 rounded-lg ${currentView === VIEWS.SETUP
              ? 'bg-blue-600'
              : 'bg-gray-200'
              }`}
          >
            <Text className={`text-center font-medium text-sm ${currentView === VIEWS.SETUP
              ? 'text-white'
              : 'text-gray-700'
              }`}>
              Setup
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCurrentView(VIEWS.DASHBOARD)}
            className={`flex-1 py-3 px-3 rounded-lg ${currentView === VIEWS.DASHBOARD
              ? 'bg-blue-600'
              : 'bg-gray-200'
              }`}
          >
            <Text className={`text-center font-medium text-sm ${currentView === VIEWS.DASHBOARD
              ? 'text-white'
              : 'text-gray-700'
              }`}>
              Dashboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setCurrentView(VIEWS.SETTINGS)}
            className={`flex-1 py-3 px-3 rounded-lg ${currentView === VIEWS.SETTINGS
              ? 'bg-blue-600'
              : 'bg-gray-200'
              }`}
          >
            <Text className={`text-center font-medium text-sm ${currentView === VIEWS.SETTINGS
              ? 'text-white'
              : 'text-gray-700'
              }`}>
              Settings
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Show notification setup interface on all platforms */}
      <NotificationSetup />
    </ScrollView>
  );
};

export default Index;
