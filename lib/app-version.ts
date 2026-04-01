import pkg from "@/package.json";

const baseVersion = typeof pkg.version === "string" ? pkg.version : "0.1.0";

export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION?.trim() || baseVersion;
export const APP_VERSION_LABEL = APP_VERSION.startsWith("v") ? APP_VERSION : `v${APP_VERSION}`;
export const APP_RELEASE_CHANNEL = process.env.NEXT_PUBLIC_APP_RELEASE_CHANNEL?.trim() || "";

export function getAppVersionText() {
  return APP_RELEASE_CHANNEL
    ? `${APP_VERSION_LABEL} · ${APP_RELEASE_CHANNEL}`
    : APP_VERSION_LABEL;
}
