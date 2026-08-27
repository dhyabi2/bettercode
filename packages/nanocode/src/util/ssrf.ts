import dns from "node:dns/promises"
import net from "node:net"

export class SSRFBlockedError extends Error {
  constructor(hostname: string) {
    super(`Refusing to fetch "${hostname}": it resolves to a private, loopback, link-local, or reserved address`)
    this.name = "SSRFBlockedError"
  }
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return true
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 192 && b === 0 && c === 2) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

function expandIPv6(ip: string): number[] {
  const [head, tail] = ip.split("::")
  const headParts = head ? head.split(":").filter(Boolean) : []
  const tailParts = tail ? tail.split(":").filter(Boolean) : []
  const missing = Math.max(8 - headParts.length - tailParts.length, 0)
  const groups = [...headParts, ...Array(missing).fill("0"), ...tailParts]
  return groups.map((g) => parseInt(g, 16) || 0)
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return isBlockedIPv4(mapped[1]!)
  if (normalized === "::" || normalized === "::1") return true
  const first = expandIPv6(normalized)[0] ?? 0
  if ((first & 0xffc0) === 0xfe80) return true // link-local fe80::/10 (also covers the IPv6 metadata address)
  if ((first & 0xfe00) === 0xfc00) return true // unique local fc00::/7
  if ((first & 0xff00) === 0xff00) return true // multicast ff00::/8
  return false
}

export async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIPv4(hostname)) {
    if (isBlockedIPv4(hostname)) throw new SSRFBlockedError(hostname)
    return
  }
  if (net.isIPv6(hostname)) {
    if (isBlockedIPv6(hostname)) throw new SSRFBlockedError(hostname)
    return
  }
  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  if (records.length === 0) throw new SSRFBlockedError(hostname)
  for (const record of records) {
    const blocked = record.family === 6 ? isBlockedIPv6(record.address) : isBlockedIPv4(record.address)
    if (blocked) throw new SSRFBlockedError(hostname)
  }
}
