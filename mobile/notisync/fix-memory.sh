#!/bin/bash

echo "🔧 Fixing React Native Web Memory Issues..."

# Clear all caches
echo "📦 Clearing caches..."
npx expo start --clear &
sleep 2
pkill -f "expo start"

# Clear npm cache
echo "🧹 Clearing npm cache..."
npm cache clean --force

# Clear node_modules and reinstall (optional - uncomment if needed)
# echo "🗑️  Clearing node_modules..."
# rm -rf node_modules
# echo "📦 Reinstalling dependencies..."
# npm install

echo "🚀 Starting with increased memory limit..."
NODE_OPTIONS="--max-old-space-size=8192" npx expo start --web --clear

echo "✅ If this still fails, try running: npm run web:clear"