// Both steganoscope://scan and https://steganoscope.app/SCAN (the countdown link, in upper case to fit the QR
// alphanumeric mode) open the Receive screen. expo-sharing reports a file shared from another app as
// steganoscope://expo-sharing, which opens the Share screen.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    if (/^(steganoscope:\/\/)?\/?expo-sharing\/?$/i.test(path)) return '/share';
    return /^(steganoscope:\/\/|https:\/\/steganoscope\.app\/)?\/?scan\/?$/i.test(path) ? '/' : path;
  } catch {
    return '/';
  }
}
