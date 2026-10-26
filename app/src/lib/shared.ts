// Reads a file another app shared to Steganoscope. The platform hands over a URI (file:// on iOS, often
// content:// on Android); reading it with the file API can give nothing, so a second reader is tried, and an
// empty result is an error rather than an empty item in the library. No React Native imports, so it is tested
// in Node (test/shared.test.ts).
export type Reader = (uri: string) => Promise<Uint8Array>;

export async function readShared(uri: string, size: number | null, readers: Reader[]): Promise<Uint8Array> {
  let why = 'it could not be read';
  for (const read of readers) {
    try {
      const bytes = await read(uri);
      if (bytes.length > 0 && (!size || bytes.length === size)) return bytes;
      why = bytes.length === 0 ? 'it came through empty' : `${bytes.length} bytes came through of ${size}`;
    } catch (e) {
      why = (e as Error).message;
    }
  }
  throw new Error(`The shared file could not be used: ${why}.`);
}
