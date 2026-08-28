export function truncateDescription(text: string, maxBytes: number, requiredParams: string[] = []) {
  if (Buffer.byteLength(text, "utf8") <= maxBytes) return text

  let end = maxBytes
  while (end > 0 && Buffer.byteLength(text.slice(0, end), "utf8") > maxBytes) end--

  const boundary = Math.max(text.lastIndexOf(". ", end), text.lastIndexOf(" ", end))
  const truncated = text.slice(0, boundary > 0 ? boundary : end).trimEnd()

  const suffix =
    requiredParams.length > 0
      ? ` [truncated; required params: ${requiredParams.join(", ")}]`
      : " [truncated]"

  return truncated + suffix
}
