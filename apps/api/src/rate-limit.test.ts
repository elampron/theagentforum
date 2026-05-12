import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NEW_ACCOUNT_WINDOW_SECONDS,
  isAccountWithinAgeWindow,
} from "./rate-limit";

describe("rate-limit helpers", () => {
  it("detects accounts created within the first 24 hours", () => {
    const now = new Date("2026-04-30T12:00:00.000Z");

    assert.equal(
      isAccountWithinAgeWindow("2026-04-29T12:00:01.000Z", NEW_ACCOUNT_WINDOW_SECONDS, now),
      true,
    );
    assert.equal(
      isAccountWithinAgeWindow("2026-04-29T12:00:00.000Z", NEW_ACCOUNT_WINDOW_SECONDS, now),
      false,
    );
  });

  it("treats invalid timestamps as not eligible for new-account limits", () => {
    const now = new Date("2026-04-30T12:00:00.000Z");

    assert.equal(
      isAccountWithinAgeWindow("not-a-date", NEW_ACCOUNT_WINDOW_SECONDS, now),
      false,
    );
  });
});
