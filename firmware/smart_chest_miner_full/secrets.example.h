// Copy this file to secrets.h locally, then fill in the device credentials.
// secrets.h is ignored by Git and must never be committed.

#define SCM_WIFI_SSID "your_wifi_ssid"
#define SCM_WIFI_PASSWORD "your_wifi_password"
#define SCM_FIREBASE_DATABASE_URL "https://your-project-default-rtdb.firebaseio.com/"

// Legacy RTDB database secret. Prefer replacing this firmware path with
// Firebase Auth/short-lived device tokens before production deployment.
#define SCM_FIREBASE_DATABASE_SECRET "your_database_secret"
