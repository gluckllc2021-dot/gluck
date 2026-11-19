import { timingSafeEqual } from "crypto";

export function cronAuthorized(header: string | null, secret: string | undefined) {
  const token = secret?.trim() || "";
  const given = (header || "").trim();
  if (!token || !given) return false;
  const left = Buffer.from(given);
  const right = Buffer.from(token);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
