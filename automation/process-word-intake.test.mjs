import assert from "node:assert/strict";
import test from "node:test";
import { validIntake, validVocabularySet } from "./process-word-intake.mjs";

test("accepts a valid pending iPhone intake", () => {
  assert.equal(validIntake({ id: "2026-08-10-123456", date: "2026-08-10", content: "take the reins", status: "pending_review" }), true);
});

test("rejects empty and malformed shortcut records", () => {
  assert.equal(validIntake({ id: "2026-08-10-123456", date: "2026-08-10", content: "" }), false);
  assert.equal(validIntake({ id: "2026-08-10-123456", date: "2026-08-10", content: "2026-08-10-123456" }), false);
});

test("allows a quota failure to be retried after billing is enabled", () => {
  assert.equal(validIntake({ id: "2026-08-10-123456", date: "2026-08-10", content: "squeaky", status: "needs_review", processingError: "insufficient_quota: credit balance exhausted" }), true);
});

test("requires complete learning and testing fields", () => {
  assert.equal(validVocabularySet({ id: "auto-1", date: "2026-08-10", label: "Automatic", words: [], questions: [] }), false);
});
