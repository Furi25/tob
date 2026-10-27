// Which web addresses the verifier may fetch (docs/specs/book-content-tool.md, "Online verification").
// A page is fetched only over https, on the default port, by host name, and only if every address
// the name resolves to is public. The same rules apply again on every redirect.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type Resolve = (hostname: string) => Promise<string[]>;

function ipv4Octets(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) return null;
  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
}

function isPublicIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && octets[2] === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a >= 224) return false;
  return true;
}

/** Expands an IPv6 text form to eight 16-bit groups, or null if it is not valid. */
function ipv6Groups(address: string): number[] | null {
  let text = address.toLowerCase();
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  const lastColon = text.lastIndexOf(":");
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = ipv4Octets(tail);
    if (octets === null) return null;
    text = `${text.slice(0, lastColon + 1)}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string): number[] | null => {
    if (part === "") return [];
    const groups = part.split(":").map((group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : Number.NaN));
    return groups.some(Number.isNaN) ? null : groups;
  };
  const head = parse(halves[0]);
  if (head === null) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const rest = parse(halves[1]);
  if (rest === null || head.length + rest.length > 7) return null;
  return [...head, ...new Array<number>(8 - head.length - rest.length).fill(0), ...rest];
}

function isPublicIpv6(groups: number[]): boolean {
  const allZero = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);
  if (allZero(0, 5) && (groups[5] === 0xffff || groups[5] === 0)) {
    // IPv4-mapped (::ffff:a.b.c.d) or IPv4-compatible (::a.b.c.d), including :: and ::1.
    const octets = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff];
    return isPublicIpv4(octets);
  }
  const first = groups[0];
  if ((first & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false; // link local fe80::/10
  if ((first & 0xff00) === 0xff00) return false; // multicast
  if (first === 0x2001 && groups[1] === 0x0db8) return false; // documentation
  if (first === 0x0064 && groups[1] === 0xff9b) return false; // NAT64
  return true;
}

/** True only for a globally routable address. Anything that cannot be read as an address is not public. */
export function isPublicAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const octets = ipv4Octets(address);
    return octets !== null && isPublicIpv4(octets);
  }
  if (kind === 6) {
    const groups = ipv6Groups(address);
    return groups !== null && isPublicIpv6(groups);
  }
  return false;
}

/** The rules that need no look-up: https, default port, no user info, a host name rather than an address. */
export function hasAllowedShape(url: URL): boolean {
  if (url.protocol !== "https:") return false;
  if (url.port !== "") return false;
  if (url.username !== "" || url.password !== "") return false;
  const host = url.hostname;
  if (host === "" || host.startsWith("[") || isIP(host) !== 0) return false;
  // WHATWG URL turns forms such as 0x7f.1 or 2130706433 into dotted quads, so those are caught above.
  return true;
}

export type Target = "ok" | "blocked" | "unresolved";

/**
 * Decides whether a URL may be fetched: `blocked` when its shape is not allowed or any address of its host is not
 * public, `unresolved` when the host name gives no address, `ok` otherwise.
 */
export async function checkTarget(url: URL, resolve: Resolve): Promise<Target> {
  if (!hasAllowedShape(url)) return "blocked";
  let addresses: string[];
  try {
    addresses = await resolve(url.hostname);
  } catch {
    return "unresolved";
  }
  if (addresses.length === 0) return "unresolved";
  return addresses.every(isPublicAddress) ? "ok" : "blocked";
}

const RESOLVE_TIMEOUT_MS = 10_000;

/** The real name look-up, with a time limit so a dead resolver cannot hold the run. */
export const systemResolve: Resolve = async (hostname) => {
  const lookups = lookup(hostname, { all: true, verbatim: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("name look-up timed out")), RESOLVE_TIMEOUT_MS);
  });
  try {
    const found = await Promise.race([lookups, timeout]);
    return found.map((entry) => entry.address);
  } finally {
    clearTimeout(timer);
    lookups.catch(() => undefined);
  }
};
