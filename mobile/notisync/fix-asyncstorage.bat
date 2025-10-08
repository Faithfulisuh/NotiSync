@echo off
echo 🔧 Fixing AsyncStorage Issue on Physical Device...

echo 📱 Step 1: Stopping current development server...
taskkill /f /im node.exe 2>nul

echo 🧹 Step 2: Clearing Expo cache...
npx expo start --clear
timeout /t 3 /nobreak > nul
taskkill /f /im node.exe 2>nul

echo 📦 Step 3: Checking dependencies...
npx expo install --fix

echo 🚀 Step 4: Starting with clear cache...
npx expo start --clear

echo ✅ AsyncStorage fix applied!
echo.
echo If the issue persists:
echo 1. Try: npx expo run:android --clear-cache
echo 2. Or: npx expo run:ios --clear-cache
echo 3. Check ASYNCSTORAGE_FIX.md for more solutions