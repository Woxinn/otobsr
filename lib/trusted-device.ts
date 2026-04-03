export const TRUSTED_DEVICE_COOKIE = "trusted_device";
export const PENDING_DEVICE_COOKIE = "pending_device";
export const DEVICE_VERIFICATION_TTL_MINUTES = 2;
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;

const hex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

export async function hashDeviceToken(token: string) {
  const data = new TextEncoder().encode(token);
  return hex(await crypto.subtle.digest("SHA-256", data));
}

export function createDeviceToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

const detectPlatform = (userAgent: string) => {
  const value = userAgent.toLowerCase();
  if (value.includes("windows")) return "Windows";
  if (value.includes("mac os") || value.includes("macintosh")) return "macOS";
  if (value.includes("iphone") || value.includes("ipad") || value.includes("ios")) return "iOS";
  if (value.includes("android")) return "Android";
  if (value.includes("linux")) return "Linux";
  return "Bilinmeyen platform";
};

const detectBrowser = (userAgent: string) => {
  const value = userAgent.toLowerCase();
  if (value.includes("edg/")) return "Edge";
  if (value.includes("opr/") || value.includes("opera")) return "Opera";
  if (value.includes("chrome/")) return "Chrome";
  if (value.includes("firefox/")) return "Firefox";
  if (value.includes("safari/") && !value.includes("chrome/")) return "Safari";
  return "Bilinmeyen tarayıcı";
};

export function describeDevice(userAgent: string | null | undefined) {
  const normalized = String(userAgent ?? "").trim();
  const platform = detectPlatform(normalized);
  const browser = detectBrowser(normalized);
  return {
    browser,
    platform,
    label: `${browser} / ${platform}`,
    userAgent: normalized || "Bilinmeyen cihaz",
  };
}

export function normalizeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) return "/";
  if (value.startsWith("/login")) return "/";
  if (value.startsWith("/device-check")) return "/";
  if (value.startsWith("/device-approve")) return "/";
  return value;
}
