export * as Wildcard from "./wildcard"

export function match(input: string, pattern: string, opts?: { pathMode?: boolean }) {
  const normalized = input.replaceAll("\\", "/")
  // A bare `*` is the unscoped "match anything" wildcard (e.g. the default `resource: "*"` allow
  // rule) — treat it like `**` even in pathMode so it still spans nested paths. pathMode only needs
  // to stop a *scoped* pattern like `dir/*` from absorbing an entire subtree.
  const effectivePattern = opts?.pathMode && pattern === "*" ? "**" : pattern
  let escaped = effectivePattern
    .replaceAll("\\", "/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    // `**` always crosses path separators (glob "match any depth" convention), even in pathMode.
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, opts?.pathMode ? "[^/]*" : ".*")
    .replace(/\0/g, ".*")
    .replace(/\?/g, ".")

  if (!opts?.pathMode && escaped.endsWith(" .*")) escaped = escaped.slice(0, -3) + "( .*)?"

  const flags = opts?.pathMode ? "i" : "si"
  const regex = new RegExp("^" + escaped + "$", flags)
  if (regex.test(normalized)) return true

  // gitignore-style basename matching: in pathMode, a pattern with no `/` segment (e.g. "*.env",
  // "id_rsa*") is a bare filename glob and matches the file's basename at any depth, mirroring
  // standard .gitignore semantics — it must not require the *entire* relative path to match.
  // Patterns that do contain `/` stay anchored to the full path (this is what keeps a scoped grant
  // like "/foo/*" from absorbing "/foo/sub/deep/*").
  if (opts?.pathMode && !effectivePattern.includes("/")) {
    const basename = normalized.slice(normalized.lastIndexOf("/") + 1)
    if (basename !== normalized && regex.test(basename)) return true
  }

  return false
}
