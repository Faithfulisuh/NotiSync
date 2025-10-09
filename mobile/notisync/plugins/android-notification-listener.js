const { withAndroidManifest } = require('@expo/config-plugins');

const withNotificationListener = (config) => {
  return withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    // Add notification listener service
    if (!androidManifest.application) {
      androidManifest.application = [{}];
    }
    
    const application = androidManifest.application[0];
    
    if (!application.service) {
      application.service = [];
    }
    
    // Add NotificationListenerService
    application.service.push({
      $: {
        'android:name': '.NotificationListenerService',
        'android:label': 'NotiSync Notification Listener',
        'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
        'android:exported': 'false'
      },
      'intent-filter': [
        {
          action: [
            {
              $: {
                'android:name': 'android.service.notification.NotificationListenerService'
              }
            }
          ]
        }
      ]
    });
    
    // Add foreground service for background processing
    application.service.push({
      $: {
        'android:name': '.BackgroundNotificationService',
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'dataSync'
      }
    });
    
    // Add uses-permission for notification listener
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }
    
    const permissions = [
      'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.ACCESS_NOTIFICATION_POLICY',
      'android.permission.WAKE_LOCK',
      'android.permission.RECEIVE_BOOT_COMPLETED'
    ];
    
    permissions.forEach(permission => {
      const exists = androidManifest['uses-permission'].some(
        p => p.$['android:name'] === permission
      );
      
      if (!exists) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': permission }
        });
      }
    });
    
    return config;
  });
};

module.exports = withNotificationListener;