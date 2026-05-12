import { runSql } from "./postgres";
import type {
  RateLimitCounterInput,
  RateLimitCounterRecord,
  RateLimitStore,
} from "./rate-limit";

export function createPostgresRateLimitStore(): RateLimitStore {
  return {
    incrementCounter,
  };
}

async function incrementCounter(
  input: RateLimitCounterInput,
): Promise<RateLimitCounterRecord> {
  const output = await runSql(
    `
      insert into rate_limit_counters (
        action,
        scope_type,
        scope_key_hash,
        window_seconds,
        window_started_at,
        request_count
      )
      values (
        :'action',
        :'scope_type',
        :'scope_key_hash',
        cast(:'window_seconds' as integer),
        cast(:'window_started_at' as timestamptz),
        1
      )
      on conflict (action, scope_type, scope_key_hash, window_seconds, window_started_at)
      do update
      set
        request_count = rate_limit_counters.request_count + 1,
        updated_at = now()
      returning json_build_object(
        'count',
        request_count
      ) :: text;
    `,
    {
      action: input.action,
      scope_type: input.scopeType,
      scope_key_hash: input.scopeKeyHash,
      window_seconds: String(input.windowSeconds),
      window_started_at: input.windowStartedAt,
    },
  );

  if (!output) {
    throw new Error("Failed to increment rate limit counter.");
  }

  return JSON.parse(output) as RateLimitCounterRecord;
}
