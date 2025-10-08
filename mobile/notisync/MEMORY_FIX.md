# Memory Issue Fix for React Native Web

## Problem
JavaScript heap out of memory error when running the web version.

## Solutions Applied

### 1. Code Cleanup
- ✅ Removed unused methods from `webNotificationCapture.ts`
- ✅ Eliminated simulated notifications that could cause memory leaks
- ✅ Cleaned up unused imports and functions

### 2. Memory Optimization Steps

#### Increase Node.js Memory Limit
Add this to your package.json scripts:

```json
{
  "scripts": {
    "web": "NODE_OPTIONS='--max-old-space-size=4096' expo start --web",
    "web:dev": "NODE_OPTIONS='--max-old-space-size=8192' expo start --web --dev-client"
  }
}
```

#### Clear Development Cache
Run these commands:
```bash
# Clear Expo cache
npx expo start --clear

# Clear npm/yarn cache
npm cache clean --force
# or
yarn cache clean

# Clear node_modules and reinstall
rm -rf node_modules
npm install
# or
yarn install
```

#### Optimize Bundle Size
1. **Check for large dependencies:**
```bash
npx expo install --fix
```

2. **Use dynamic imports for large components:**
```javascript
// Instead of:
import { LargeComponent } from './LargeComponent';

// Use:
const LargeComponent = React.lazy(() => import('./LargeComponent'));
```

### 3. Development Environment Fixes

#### Metro Configuration
Create/update `metro.config.js`:
```javascript
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optimize for memory usage
config.resolver.platforms = ['ios', 'android', 'native', 'web'];
config.transformer.minifierConfig = {
  keep_fnames: true,
  mangle: {
    keep_fnames: true,
  },
};

module.exports = config;
```

#### Webpack Memory Optimization
If using custom webpack config, add:
```javascript
module.exports = {
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
};
```

### 4. Runtime Memory Management

#### Component Optimization
- ✅ Using functional components with hooks
- ✅ Proper cleanup in useEffect
- ✅ Avoiding memory leaks in intervals/timeouts

#### Storage Optimization
- ✅ Limited stored notifications to 1000 items
- ✅ Proper cleanup of AsyncStorage

### 5. Quick Fixes to Try

1. **Restart with increased memory:**
```bash
NODE_OPTIONS="--max-old-space-size=8192" npx expo start --web --clear
```

2. **Use production build:**
```bash
npx expo build:web
```

3. **Check for circular dependencies:**
```bash
npx madge --circular --extensions ts,tsx src/
```

### 6. Alternative Solutions

If the issue persists:

1. **Use Expo Development Build instead of web:**
```bash
npx expo run:ios
# or
npx expo run:android
```

2. **Split the app into smaller chunks**
3. **Use React.memo for expensive components**
4. **Implement virtual scrolling for large lists**

## Current Status
- ✅ Removed simulated notifications
- ✅ Cleaned up unused code
- ✅ Applied TailwindCSS optimizations
- ⏳ Try the memory limit increase
- ⏳ Clear caches and restart

## Next Steps
1. Try the NODE_OPTIONS fix first
2. Clear all caches
3. If still failing, use native development instead of web