import { describe, expect, test } from "bun:test"
import { parsePluginSpecifier } from "../../src/plugin/shared"

describe("parsePluginSpecifier", () => {
  test("parses standard npm package without version", () => {
    expect(parsePluginSpecifier("acme")).toEqual({
      pkg: "acme",
      version: "latest",
    })
  })

  test("parses standard npm package with version", () => {
    expect(parsePluginSpecifier("acme@1.0.0")).toEqual({
      pkg: "acme",
      version: "1.0.0",
    })
  })

  test("parses scoped npm package without version", () => {
    expect(parsePluginSpecifier("@bettercode/acme")).toEqual({
      pkg: "@bettercode/acme",
      version: "latest",
    })
  })

  test("parses scoped npm package with version", () => {
    expect(parsePluginSpecifier("@bettercode/acme@1.0.0")).toEqual({
      pkg: "@bettercode/acme",
      version: "1.0.0",
    })
  })

  test("parses package with git+https url", () => {
    expect(parsePluginSpecifier("acme@git+https://github.com/bettercode/acme.git")).toEqual({
      pkg: "acme",
      version: "git+https://github.com/bettercode/acme.git",
    })
  })

  test("parses scoped package with git+https url", () => {
    expect(parsePluginSpecifier("@bettercode/acme@git+https://github.com/bettercode/acme.git")).toEqual({
      pkg: "@bettercode/acme",
      version: "git+https://github.com/bettercode/acme.git",
    })
  })

  test("parses package with git+ssh url containing another @", () => {
    expect(parsePluginSpecifier("acme@git+ssh://git@github.com/bettercode/acme.git")).toEqual({
      pkg: "acme",
      version: "git+ssh://git@github.com/bettercode/acme.git",
    })
  })

  test("parses scoped package with git+ssh url containing another @", () => {
    expect(parsePluginSpecifier("@bettercode/acme@git+ssh://git@github.com/bettercode/acme.git")).toEqual({
      pkg: "@bettercode/acme",
      version: "git+ssh://git@github.com/bettercode/acme.git",
    })
  })

  test("parses unaliased git+ssh url", () => {
    expect(parsePluginSpecifier("git+ssh://git@github.com/bettercode/acme.git")).toEqual({
      pkg: "git+ssh://git@github.com/bettercode/acme.git",
      version: "",
    })
  })

  test("parses npm alias using the alias name", () => {
    expect(parsePluginSpecifier("acme@npm:@bettercode/acme@1.0.0")).toEqual({
      pkg: "acme",
      version: "npm:@bettercode/acme@1.0.0",
    })
  })

  test("parses bare npm protocol specifier using the target package", () => {
    expect(parsePluginSpecifier("npm:@bettercode/acme@1.0.0")).toEqual({
      pkg: "@bettercode/acme",
      version: "1.0.0",
    })
  })

  test("parses unversioned npm protocol specifier", () => {
    expect(parsePluginSpecifier("npm:@bettercode/acme")).toEqual({
      pkg: "@bettercode/acme",
      version: "latest",
    })
  })
})
