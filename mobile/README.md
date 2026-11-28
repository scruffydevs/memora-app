# Memora Android app

A thin native shell around the Memora web app. It adds one thing a website cannot do: read a watch's daily numbers
(sleep, steps, heart rate, resting heart rate, heart rate variability, blood oxygen, active calories) from
**Health Connect** on the phone and send them to Memora.

How the data gets here: the watch syncs to its own app (for the Amazfit Bip 5, the Zepp app), the watch app writes to
Health Connect, and this app reads Health Connect when you tap **Sync now** on the **Watch** tab.

The app loads the web app from the server (`https://memora-app.deploygrid.net` by default), so a web update reaches the
phone without a new install. Only a change in `mobile/` needs a new APK.

## Get the APK (no Android Studio needed)

1. On GitHub open **Actions → Android app → Run workflow**.
2. When it finishes, download the **memora-debug-apk** artifact from the run and unzip it.
3. Copy `app-debug.apk` to the phone and open it. Allow "install unknown apps" when asked.

## Set up the phone

1. Android 14 or newer has Health Connect built in. On older phones install **Health Connect by Android** from the Play Store.
2. In the watch app, link Health Connect (Zepp: Profile → 3rd-party account linking → Health Connect) and allow it to write the data you want.
3. Open Memora, sign in, open the patient, and go to **Watch**. Tap **Allow access**, then **Sync now**.
   The patient's wearable consent must be switched on first (Memora team, under Consent).

The Watch tab lists, per data type, how many days Health Connect returned. That shows what the watch really writes.

## Build it yourself

You need JDK 21 and the Android SDK (Android Studio installs both).

```
cd mobile
npm install
npx cap sync android
cd android && ./gradlew assembleDebug      # APK: android/app/build/outputs/apk/debug/app-debug.apk
```

To point the app at another server (for example your laptop on the same Wi-Fi), run `MEMORA_URL=http://192.168.1.20:3000 npx cap sync android` before building.

## Status

Written and unit-tested for the parts that run anywhere (the reader that turns Health Connect samples into daily rows,
and the server API). The Android build and the Health Connect permission flow have **not yet been run on a real phone**.
