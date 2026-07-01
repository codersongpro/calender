import { createHash } from "node:crypto";

const attempts = new Map();
const WINDOW_MS = 1000 * 60 * 10;
const LOCK_MS = 1000 * 60 * 15;
const MAX_FAILURES = 5;

export function authAttemptKey(request, namespace) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const rawIp = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const ipHash = createHash("sha256").update(rawIp).digest("base64url").slice(0, 24);
  return `${namespace}:${ipHash}`;
}

export function assertAuthAttemptAllowed(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry) return;
  if (entry.lockedUntil && entry.lockedUntil > now) {
    throw httpError("로그인 실패가 반복되어 잠시 후 다시 시도해 주세요.", 429);
  }
  if (entry.windowStart + WINDOW_MS <= now) attempts.delete(key);
}

export function recordAuthFailure(key, now = Date.now()) {
  const entry = attempts.get(key);
  if (!entry || entry.windowStart + WINDOW_MS <= now) {
    attempts.set(key, { count: 1, windowStart: now, lockedUntil: 0 });
    return;
  }
  const count = entry.count + 1;
  attempts.set(key, {
    count,
    windowStart: entry.windowStart,
    lockedUntil: count >= MAX_FAILURES ? now + LOCK_MS : entry.lockedUntil,
  });
}

export function recordAuthSuccess(key) {
  attempts.delete(key);
}

function httpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}
