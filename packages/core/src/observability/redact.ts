import { Hash } from "../util/hash"

const PREVIEW_LENGTH = 40

export function redactPreview(value: string): { preview: string; hash: string } {
  return {
    preview: value.slice(0, PREVIEW_LENGTH),
    hash: Hash.sha256(value).slice(0, 8),
  }
}

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
  /sk-[A-Za-z0-9]{10,}/gi,
  /AKIA[A-Z0-9]{12,}/g,
  /-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
  /((?:KEY|SECRET|TOKEN|PASSWORD|PWD)\s*[:=]\s*)\S+/gi,
]

export function sanitizeString(value: string): string {
  let result = value
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, (match, group?: string) => (group ? `${group}[REDACTED]` : "[REDACTED]"))
  }
  return result
}

export function sanitizeValue(value: unknown): unknown {
  return typeof value === "string" ? sanitizeString(value) : value
}
