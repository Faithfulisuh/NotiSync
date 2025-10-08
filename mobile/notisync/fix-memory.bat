@echo off
echo 🔧 Fixing React Native Web Memory Issues...

echo 📦 Clearing Expo cache...
npx expo start --clear
timeout /t 3 /nobreak > nul
taskkill /f /im node.exe 2>nul

echo 🧹 Clearing npm cache...
npm cache clean --force

echo 🚀 Starting with increased memory limit...
set NODE_OPTIONS=--max-old-space-size=8192
npx expo start --web --clear

echo ✅ If this still fails, try running: npm run web:clear