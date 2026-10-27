export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getEncryptionKey(["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptSecret(encryptedB64: string): Promise<string> {
  const key = await getEncryptionKey(["decrypt"]);
  const combined = Uint8Array.from(atob(encryptedB64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

async function getEncryptionKey(usages: KeyUsage[]): Promise<CryptoKey> {
  const masterKeyB64 = Deno.env.get("ENCRYPTION_MASTER_KEY");
  if (!masterKeyB64) throw new Error("Encryption key not configured");
  const rawKey = Uint8Array.from(atob(masterKeyB64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, usages);
}
