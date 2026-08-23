/**
 * Argon2id password hashing. Per CLAUDE.md §2 (signup: hash password) and
 * §17 (Authentication: argon2).
 *
 * We use argon2id (the default) with library defaults, which are tuned
 * reasonably for 2024+ hardware. Never log or store the plaintext.
 */

import { hash, verify, type Options } from "argon2";

const HASH_OPTIONS: Options = {
  type: 2, // argon2id
  memoryCost: 19456, // 19 MiB — OWASP baseline
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext, HASH_OPTIONS);
}

export function verifyPassword(hashValue: string, plaintext: string): Promise<boolean> {
  return verify(hashValue, plaintext);
}
