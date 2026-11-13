# Setup

```bash
mkdir scheduler && cd scheduler        # put the www/ folder + capacitor.config.json here
npm init -y
npm i @capacitor/core @capacitor/cli @capacitor/local-notifications @capacitor/android
npx cap add android
npx cap sync
npx cap open android                   # or: npx cap run android
```

Add to `android/app/src/main/AndroidManifest.xml` (inside <manifest>, above <application>):

```xml
<uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM"/>
```

After every change in `www/`, run `npx cap sync`.
