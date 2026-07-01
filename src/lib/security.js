import { createHash, pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 210000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export async function hashPassword(password) {
  assertPassword(password);
  const salt = randomBytes(16).toString("base64url");
  const hash = await pbkdf2Async(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `pbkdf2:${DIGEST}:${ITERATIONS}:${salt}:${hash.toString("base64url")}`;
}

export async function verifyPassword(password, storedHash) {
  if (!password || !storedHash) return false;
  const parts = String(storedHash).split(":");
  if (parts.length !== 5 || parts[0] !== "pbkdf2") return false;
  const [, digest, iterationsValue, salt, hashValue] = parts;
  const expected = Buffer.from(hashValue, "base64url");
  const actual = await pbkdf2Async(password, salt, Number(iterationsValue), expected.length, digest);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSessionToken(payload, secret, { now = Date.now() } = {}) {
  const encodedPayload = Buffer.from(
    JSON.stringify({ ...payload, iat: now, nonce: randomBytes(8).toString("base64url") }),
  ).toString("base64url");
  const signature = signTokenPayload(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export function verifySessionToken(token, secret, expectedScope, { now = Date.now() } = {}) {
  const [payload, signature] = String(token ?? "").split(".");
  if (!payload || !signature) return null;
  if (signTokenPayload(payload, secret) !== signature) return null;

  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (expectedScope && data.scope !== expectedScope) return null;
  if (data.expiresAt && now > Number(data.expiresAt)) return null;
  return data;
}

function signTokenPayload(payload, secret) {
  return createHash("sha256").update(`${payload}.${secret}`).digest("base64url");
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 4) {
    throw new Error("비밀번호는 4자 이상이어야 합니다.");
  }
}
