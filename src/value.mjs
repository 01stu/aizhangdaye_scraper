export function getPath(value, path, fallback = undefined) {
  if (!path) return value;
  const parts = String(path)
    .replace(/\[([0-9]+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current == null || !(part in Object(current))) return fallback;
    current = current[part];
  }
  return current === undefined ? fallback : current;
}

export function numberValue(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  const parsed = Number(String(value ?? "").replace(/[,￥$]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function absoluteUrl(value, base) {
  try {
    return new URL(String(value || base), base).href;
  } catch {
    return base;
  }
}

export function stableKey(value) {
  const text = String(value ?? "").trim();
  if (/^[A-Za-z0-9_.-]{1,120}$/.test(text)) return text;
  return createHash("sha1").update(text).digest("hex").slice(0, 16);
}
import { createHash } from "node:crypto";
