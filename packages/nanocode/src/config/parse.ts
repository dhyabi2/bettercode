export * as ConfigParse from "./parse"

import { type ParseError as JsoncParseError, parse as parseJsoncImpl, printParseErrorCode } from "jsonc-parser"
import { Cause, Exit, Schema as EffectSchema, SchemaIssue } from "effect"
import type { DeepMutable } from "@nanocode-ai/core/schema"
import { InvalidError, JsonError } from "@nanocode-ai/core/v1/config/error"

export function jsonc(text: string, filepath: string, rawText: string = text): unknown {
  const errors: JsoncParseError[] = []
  const data = parseJsoncImpl(text, errors, { allowTrailingComma: true })
  if (errors.length) {
    const rawErrors: JsoncParseError[] = []
    if (rawText !== text) parseJsoncImpl(rawText, rawErrors, { allowTrailingComma: true })
    const useRaw = rawText !== text && rawErrors.length === errors.length
    const sourceText = useRaw ? rawText : text
    const sourceErrors = useRaw ? rawErrors : errors
    const lines = sourceText.split("\n")
    const issues = sourceErrors
      .map((e) => {
        const beforeOffset = sourceText.substring(0, e.offset).split("\n")
        const line = beforeOffset.length
        const column = beforeOffset[beforeOffset.length - 1].length + 1
        const problemLine = lines[line - 1]

        const error = `${printParseErrorCode(e.error)} at line ${line}, column ${column}`
        if (!problemLine) return error

        const shown = useRaw || rawText === text ? problemLine : "<line redacted after substitution>"
        return `${error}\n   Line ${line}: ${shown}\n${"".padStart(column + 9)}^`
      })
      .join("\n")
    throw new JsonError({
      path: filepath,
      message: issues || "JSONC parse error",
    })
  }

  return data
}

export function schema<S extends EffectSchema.Decoder<unknown, never>>(
  schema: S,
  data: unknown,
  source: string,
): DeepMutable<S["Type"]> {
  const decoded = EffectSchema.decodeUnknownExit(schema)(data, {
    errors: "all",
    onExcessProperty: "ignore",
    propertyOrder: "original",
  })
  if (Exit.isSuccess(decoded)) return decoded.value as DeepMutable<S["Type"]>
  const error = Cause.squash(decoded.cause)

  throw new InvalidError(
    {
      path: source,
      issues: EffectSchema.isSchemaError(error)
        ? SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues.map((issue) => ({
            ...issue,
            message: issue.message,
            path: issue.path?.map(String) ?? [],
          }))
        : [{ message: String(error), path: [] }],
    },
    { cause: error },
  )
}
