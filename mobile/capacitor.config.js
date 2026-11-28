// The Android app is a native shell that loads the Memora web app from its server, so a web update reaches the phone
// without a new install. Change the address with MEMORA_URL when running `npm run sync`.
const url = process.env.MEMORA_URL || 'https://memora-app.deploygrid.net';

module.exports = {
  appId: 'app.memora.mobile',
  appName: 'Memora',
  webDir: 'www', // only a "cannot connect" page; the real app is loaded from `server.url`
  server: { url, cleartext: url.startsWith('http://'), allowNavigation: [new URL(url).host] },
  android: { allowMixedContent: false },
};
