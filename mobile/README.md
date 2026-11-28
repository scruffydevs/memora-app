# Memora Android app

A real Android app (an APK). The Memora screens are packed inside it, so it opens straight into the app with no
browser involved, and it adds one thing a website cannot do: read a watch's daily numbers (sleep, steps, heart rate,
resting heart rate, heart rate variability, blood oxygen, active calories) from **Health Connect** on the phone and
send them to Memora.

How the data gets here: the watch syncs to its own app (for the Amazfit Bip 5, the Zepp app), the watch app writes to
Health Connect, and this app reads Health Connect when you tap **Sync now** on the **Watch** tab.

## How the app talks to the server

The screens are built into the APK (`web/dist-app`) and call the server over HTTPS
(`https://memora-app.deploygrid.net` by default). Because the screens are not served by the server, the app signs in
with a session token (sent as `Authorization: Bearer`) kept on the phone, instead of the cookie a website uses. The
server only allows cross-origin calls from the phone's own origin, and never with cookies.

A change to the screens or the server address therefore needs a new APK. For fast iteration there is a live mode that
loads the website instead (see below).

The server must be redeployed with this version before the app can sign in.

## Get the APK (no Android Studio needed)

1. On GitHub open **Actions → Android app → Run workflow** (it also runs when `mobile/` or `web/src/` change).
2. When it finishes, download the **memora-debug-apk** artifact from the run and unzip it.
3. Copy `app-debug.apk` to the phone and open it. Allow "install unknown apps" when asked.

To point the app at another server, set a repository variable `MEMORA_API` (Settings → Variables) before running.

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
npm run build:web                          # builds the screens into ../web/dist-app (MEMORA_API=... to change the server)
npx cap sync android
cd android && ./gradlew assembleDebug      # APK: android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run apk` does all of it in one go.

**Live mode** (the app loads the website, so a web change needs no new install):
`MEMORA_URL=https://memora-app.deploygrid.net npx cap sync android`, then build the APK as above.

## Status

Written and tested for the parts that run anywhere: the reader that turns Health Connect samples into daily rows, the
server API, and the bearer-token sign-in with its cross-origin rules (automated tests). The bundled screens were also
checked in a browser against a local server from the same kind of origin the phone uses: sign-in, admin lists and the
live stream all work. The Android build, the Health Connect permission flow and the phone sensors have **not yet been
run on a real phone**.
