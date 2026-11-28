// By default the APK carries the Memora screens inside it (built by `npm run build:web` into ../web/dist-app) and
// talks to the server over HTTPS. A web change therefore needs a new APK.
//
// Live mode, for fast iteration: set MEMORA_URL and the app loads the website from that address instead, so a web
// update shows up without a new install.   MEMORA_URL=https://memora-app.deploygrid.net npx cap sync android
const live = process.env.MEMORA_URL;

module.exports = {
  appId: 'app.memora.mobile',
  appName: 'Memora',
  webDir: '../web/dist-app',
  server: live
    ? { url: live, cleartext: live.startsWith('http://'), allowNavigation: [new URL(live).host] }
    : { androidScheme: 'https' },
  android: { allowMixedContent: false },
};
