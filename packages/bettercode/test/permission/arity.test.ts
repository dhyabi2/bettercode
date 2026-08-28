import { test, expect } from "bun:test"
import { BashArity } from "../../src/permission/arity"

test("arity 1 - listed commands", () => {
  expect(BashArity.prefix(["touch", "foo.txt"])).toEqual(["touch"])
})

test("unknown commands default to the full token list", () => {
  expect(BashArity.prefix(["unknown", "command", "subcommand"])).toEqual(["unknown", "command", "subcommand"])
  expect(BashArity.prefix(["curl", "https://example.com"])).toEqual(["curl", "https://example.com"])
})

test("eval-style flags force the full token list even for listed commands", () => {
  expect(BashArity.prefix(["python", "-c", "print(1)"])).toEqual(["python", "-c", "print(1)"])
  expect(BashArity.prefix(["node", "-e", "console.log(1)"])).toEqual(["node", "-e", "console.log(1)"])
})

test("arity 2 - two token commands", () => {
  expect(BashArity.prefix(["git", "checkout", "main"])).toEqual(["git", "checkout"])
  expect(BashArity.prefix(["docker", "run", "nginx"])).toEqual(["docker", "run"])
})

test("arity 3 - three token commands", () => {
  expect(BashArity.prefix(["aws", "s3", "ls", "my-bucket"])).toEqual(["aws", "s3", "ls"])
  expect(BashArity.prefix(["npm", "run", "dev", "script"])).toEqual(["npm", "run", "dev"])
})

test("longest match wins - nested prefixes", () => {
  expect(BashArity.prefix(["docker", "compose", "up", "service"])).toEqual(["docker", "compose", "up"])
  expect(BashArity.prefix(["consul", "kv", "get", "config"])).toEqual(["consul", "kv", "get"])
})

test("exact length matches", () => {
  expect(BashArity.prefix(["git", "checkout"])).toEqual(["git", "checkout"])
  expect(BashArity.prefix(["npm", "run", "dev"])).toEqual(["npm", "run", "dev"])
})

test("edge cases", () => {
  expect(BashArity.prefix([])).toEqual([])
  expect(BashArity.prefix(["single"])).toEqual(["single"])
  expect(BashArity.prefix(["git"])).toEqual(["git"])
})
