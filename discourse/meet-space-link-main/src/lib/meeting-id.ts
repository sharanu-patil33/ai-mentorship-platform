const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function block(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Generates a human friendly meeting code, e.g. `ABC-123-XYZ`. */
export function generateMeetingCode(): string {
  return `${block(3)}-${block(3)}-${block(3)}`;
}

const CODE_PATTERN = /^[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

export function isValidMeetingCode(value: string): boolean {
  if (!value) return false;
  const compact = value.trim().toUpperCase().replace(/[-_\s]+/g, "");
  return compact.length === 9 && /^[A-Z0-9]+$/.test(compact);
}

/**
 * Accepts a raw meeting code or a full/partial meeting link and returns the
 * normalized meeting code, or null when nothing usable was provided.
 */
export function parseMeetingInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(/meeting\/([^/?#\s]+)/i);
  const rawCandidate = fromUrl?.[1] ?? trimmed;
  const candidate = decodeURIComponent(rawCandidate).toUpperCase().trim();

  const compact = candidate.replace(/[-_\s]+/g, "");
  if (compact.length === 9 && /^[A-Z0-9]+$/.test(compact)) {
    return `${compact.slice(0, 3)}-${compact.slice(3, 6)}-${compact.slice(6, 9)}`;
  }
  return candidate.length > 0 ? candidate : null;
}

export function meetingPath(code: string): string {
  const clean = code.trim().toUpperCase();
  return `/meeting/${encodeURIComponent(clean)}`;
}

export function meetingLink(code: string): string {
  const clean = code.trim().toUpperCase();
  if (typeof window === "undefined") return `/meeting/${clean}`;
  return `${window.location.origin}/meeting/${clean}`;
}