const cache = new WeakMap<object, string>()

export function serialize(event: object, toJSON: (event: any) => unknown): string {
  const cached = cache.get(event)
  if (cached !== undefined) return cached
  const json = JSON.stringify(toJSON(event))
  cache.set(event, json)
  return json
}
