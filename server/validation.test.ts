import assert from "node:assert/strict"
import { test } from "node:test"
import { Hono } from "hono"
import { z } from "zod"
import { CATEGORIES } from "../shared/categories.ts"
import {
  id,
  invalidRequestBody,
  isoDate,
  limit,
  money,
  token,
  validate,
  zodIssues,
} from "./validation.ts"

test("invalidRequestBody uses the standard 400 shape", () => {
  const parsed = z.object({ x: z.number() }).safeParse({ x: "nope" })
  assert.ok(!parsed.success)
  const body = invalidRequestBody(zodIssues(parsed.error))
  assert.equal(body.error, "Invalid request")
  assert.ok(body.issues.length > 0)
  assert.equal(typeof body.issues[0]!.path, "string")
})

test("object schemas strip unknown keys", () => {
  const parsed = z.object({ a: z.number() }).safeParse({ a: 1, extra: true })
  assert.deepEqual(parsed.success ? parsed.data : null, { a: 1 })
})

test("id, isoDate, money, and limit enforce bounds", () => {
  assert.ok(!id.safeParse("not-uuid").success)
  assert.ok(id.safeParse("550e8400-e29b-41d4-a716-446655440000").success)
  assert.ok(!isoDate.safeParse("2024-13-40").success)
  assert.ok(isoDate.safeParse("2024-06-01").success)
  assert.ok(!money.safeParse(1e10).success)
  assert.equal(money.parse(0.1 + 0.2), 0.3)
  assert.ok(money.safeParse(12.34).success)
  assert.equal(limit.parse(undefined), 100)
  assert.ok(!limit.safeParse(501).success)
})

test("validate middleware on a route returns 400 with issues", async () => {
  const categoryParam = z.object({ category: z.enum(CATEGORIES) })
  const app = new Hono()
  app.delete("/budgets/:category", validate("param", categoryParam), (c) =>
    c.json({ ok: true })
  )
  const res = await app.request("/budgets/not-a-category", { method: "DELETE" })
  assert.equal(res.status, 400)
  const json = (await res.json()) as {
    error: string
    issues: { path: string; message: string }[]
  }
  assert.equal(json.error, "Invalid request")
  assert.ok(json.issues.some((i) => i.path === "category"))
})

test("malformed JSON uses the same error envelope", async () => {
  const app = new Hono()
  app.post("/x", validate("json", z.object({ n: z.number() })), (c) =>
    c.json(c.req.valid("json"))
  )
  const res = await app.request("/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  })
  assert.equal(res.status, 400)
  const json = (await res.json()) as {
    error: string
    issues: { message: string }[]
  }
  assert.equal(json.error, "Invalid request")
  assert.equal(json.issues[0]?.message, "Malformed JSON")
})

test("token accepts 24-char base64url", () => {
  assert.ok(token.safeParse("abcdefghijklmnopqrstuvwx").success)
  assert.ok(!token.safeParse("short").success)
})
