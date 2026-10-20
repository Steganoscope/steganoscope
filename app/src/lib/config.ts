// Keys fixed at build time (app.config.ts): trusted roots, and the app keys that seal everything sent.
import Constants from 'expo-constants';
import { b64url, loadKey, openContainer, type Crl } from '@steganoscope/protocol/containers.js';

const extra = (Constants.expoConfig?.extra ?? {}) as { rootKeys?: string[]; appKeys?: string[]; crl?: string; sharing?: boolean };

export const rootKeys = (extra.rootKeys ?? []).map(loadKey);
export const appKeys = (extra.appKeys ?? []).map(b64url);

// False in personal-team iOS builds, which have no App Group; expo-sharing throws without one.
export const sharingEnabled = extra.sharing !== false;

// The revocation list shipped with this release, if a root key signed it.
export const bundledCrl: Crl | undefined = (() => {
  try { return extra.crl ? openContainer(b64url(extra.crl), { roots: rootKeys, keys: appKeys }).crl : undefined; } catch { return undefined; }
})();

// The link shown in the countdown before a broadcast; it opens Steganoscope on the Receive screen.
export const LINK = 'HTTPS://STEGANOSCOPE.APP/SCAN';
