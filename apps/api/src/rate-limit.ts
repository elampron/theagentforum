import { createHash } from "node:crypto";

export type RateLimitScopeType = "user" | "ip";

export interface RateLimitRule {
  id: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitSubject {
  scopeType: RateLimitScopeType;
  scopeValue: string;
}

export interface RateLimitCounterInput {
  action: string;
  scopeType: RateLimitScopeType;
  scopeKeyHash: string;
  windowSeconds: number;
  windowStartedAt: string;
}

export interface RateLimitCounterRecord {
  count: number;
}

export interface RateLimitStore {
  incrementCounter(input: RateLimitCounterInput): Promise<RateLimitCounterRecord>;
}

export interface RateLimitExceededEvent {
  event: "taf_rate_limit_exceeded";
  action: string;
  scopeType: RateLimitScopeType;
  ruleId: string;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
}

export interface ServerEventSink {
  emit(event: RateLimitExceededEvent): Promise<void> | void;
}

export interface RateLimitCheckInput {
  action: string;
  rules: readonly RateLimitRule[];
  subjects: readonly RateLimitSubject[];
}

export interface RateLimitExceededResult {
  code: "rate_limit_exceeded";
  message: string;
  action: string;
  scopeType: RateLimitScopeType;
  ruleId: string;
  limit: number;
  windowSeconds: number;
  retryAfterSeconds: number;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; exceeded: RateLimitExceededResult };

export interface RateLimitService {
  consume(input: RateLimitCheckInput): Promise<RateLimitDecision>;
}

export interface Clock {
  now(): Date;
}

const FIFTEEN_MINUTES_SECONDS = 15 * 60;
const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * 60 * 60;

export const NEW_ACCOUNT_WINDOW_SECONDS = ONE_DAY_SECONDS;
export const AUTHENTICATED_WRITE_IP_LIMIT_MULTIPLIER = 3;

export const launchRateLimitPolicies = {
  signupStart: [
    { id: "signup_start_hour", limit: 5, windowSeconds: ONE_HOUR_SECONDS },
  ],
  passkeyLoginAttempt: [
    { id: "passkey_login_attempt_15m", limit: 10, windowSeconds: FIFTEEN_MINUTES_SECONDS },
  ],
  pairingRedeem: [
    { id: "pairing_redeem_15m", limit: 10, windowSeconds: FIFTEEN_MINUTES_SECONDS },
  ],
  createPost: [
    { id: "create_post_hour", limit: 5, windowSeconds: ONE_HOUR_SECONDS },
    { id: "create_post_day", limit: 20, windowSeconds: ONE_DAY_SECONDS },
  ],
  createReply: [
    { id: "create_reply_hour", limit: 20, windowSeconds: ONE_HOUR_SECONDS },
    { id: "create_reply_day", limit: 100, windowSeconds: ONE_DAY_SECONDS },
  ],
  acceptAnswer: [
    { id: "accept_answer_day", limit: 30, windowSeconds: ONE_DAY_SECONDS },
  ],
  profileUpdate: [
    { id: "profile_update_hour", limit: 10, windowSeconds: ONE_HOUR_SECONDS },
  ],
  apiTokenLifecycle: [
    { id: "api_token_lifecycle_day", limit: 5, windowSeconds: ONE_DAY_SECONDS },
  ],
} satisfies Record<string, readonly RateLimitRule[]>;

export const launchCompanionIpPolicies = {
  createPost: scaleRateLimitRules(
    launchRateLimitPolicies.createPost,
    AUTHENTICATED_WRITE_IP_LIMIT_MULTIPLIER,
    "ip",
  ),
  createReply: scaleRateLimitRules(
    launchRateLimitPolicies.createReply,
    AUTHENTICATED_WRITE_IP_LIMIT_MULTIPLIER,
    "ip",
  ),
  acceptAnswer: scaleRateLimitRules(
    launchRateLimitPolicies.acceptAnswer,
    AUTHENTICATED_WRITE_IP_LIMIT_MULTIPLIER,
    "ip",
  ),
  profileUpdate: scaleRateLimitRules(
    launchRateLimitPolicies.profileUpdate,
    AUTHENTICATED_WRITE_IP_LIMIT_MULTIPLIER,
    "ip",
  ),
  apiTokenLifecycle: scaleRateLimitRules(
    launchRateLimitPolicies.apiTokenLifecycle,
    AUTHENTICATED_WRITE_IP_LIMIT_MULTIPLIER,
    "ip",
  ),
} satisfies Record<string, RateLimitRule[]>;

const defaultClock: Clock = {
  now: () => new Date(),
};

export function createRateLimitService(
  store: RateLimitStore,
  options: {
    clock?: Clock;
    eventSink?: ServerEventSink;
  } = {},
): RateLimitService {
  const clock = options.clock ?? defaultClock;
  const eventSink = options.eventSink;

  return {
    async consume(input: RateLimitCheckInput): Promise<RateLimitDecision> {
      const subjects = dedupeSubjects(input.subjects);

      if (subjects.length === 0 || input.rules.length === 0) {
        return { allowed: true };
      }

      const now = clock.now();

      for (const subject of subjects) {
        for (const rule of input.rules) {
          const windowStartedAt = getWindowStartedAt(now, rule.windowSeconds);
          const record = await store.incrementCounter({
            action: input.action,
            scopeType: subject.scopeType,
            scopeKeyHash: hashScopeValue(subject.scopeValue),
            windowSeconds: rule.windowSeconds,
            windowStartedAt: windowStartedAt.toISOString(),
          });

          if (record.count <= rule.limit) {
            continue;
          }

          const retryAfterSeconds = getRetryAfterSeconds(now, windowStartedAt, rule.windowSeconds);
          const exceeded: RateLimitExceededResult = {
            code: "rate_limit_exceeded",
            message: "Too many requests for this action. Try again later.",
            action: input.action,
            scopeType: subject.scopeType,
            ruleId: rule.id,
            limit: rule.limit,
            windowSeconds: rule.windowSeconds,
            retryAfterSeconds,
          };

          await eventSink?.emit({
            event: "taf_rate_limit_exceeded",
            action: exceeded.action,
            scopeType: exceeded.scopeType,
            ruleId: exceeded.ruleId,
            limit: exceeded.limit,
            windowSeconds: exceeded.windowSeconds,
            retryAfterSeconds: exceeded.retryAfterSeconds,
          });

          return {
            allowed: false,
            exceeded,
          };
        }
      }

      return { allowed: true };
    },
  };
}

export function createNoopRateLimitService(): RateLimitService {
  return {
    async consume(): Promise<RateLimitDecision> {
      return { allowed: true };
    },
  };
}

export function createInMemoryRateLimitStore(): RateLimitStore {
  const counters = new Map<string, number>();

  return {
    async incrementCounter(input: RateLimitCounterInput): Promise<RateLimitCounterRecord> {
      const key = [
        input.action,
        input.scopeType,
        input.scopeKeyHash,
        String(input.windowSeconds),
        input.windowStartedAt,
      ].join(":");
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { count };
    },
  };
}

export function createConsoleServerEventSink(
  logger: Pick<Console, "warn"> = console,
): ServerEventSink {
  return {
    emit(event: RateLimitExceededEvent): void {
      logger.warn(JSON.stringify(event));
    },
  };
}

export function scaleRateLimitRules(
  rules: readonly RateLimitRule[],
  multiplier: number,
  suffix: string,
): RateLimitRule[] {
  return rules.map((rule) => ({
    id: `${rule.id}_${suffix}`,
    limit: Math.max(1, Math.ceil(rule.limit * multiplier)),
    windowSeconds: rule.windowSeconds,
  }));
}

export function isAccountWithinAgeWindow(
  createdAt: string,
  maxAgeSeconds: number,
  now: Date = new Date(),
): boolean {
  const createdAtMs = Date.parse(createdAt);

  if (!Number.isFinite(createdAtMs)) {
    return false;
  }

  const ageMs = now.getTime() - createdAtMs;
  return ageMs >= 0 && ageMs < maxAgeSeconds * 1000;
}

function dedupeSubjects(subjects: readonly RateLimitSubject[]): RateLimitSubject[] {
  const seen = new Set<string>();
  const deduped: RateLimitSubject[] = [];

  for (const subject of subjects) {
    const scopeValue = subject.scopeValue.trim();

    if (!scopeValue) {
      continue;
    }

    const key = `${subject.scopeType}:${scopeValue}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduped.push({
      scopeType: subject.scopeType,
      scopeValue,
    });
  }

  return deduped;
}

function hashScopeValue(scopeValue: string): string {
  return createHash("sha256").update(scopeValue).digest("hex");
}

function getWindowStartedAt(now: Date, windowSeconds: number): Date {
  const windowMs = windowSeconds * 1000;
  const startedAtMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return new Date(startedAtMs);
}

function getRetryAfterSeconds(now: Date, windowStartedAt: Date, windowSeconds: number): number {
  const retryAfterMs = windowStartedAt.getTime() + windowSeconds * 1000 - now.getTime();
  return Math.max(1, Math.ceil(retryAfterMs / 1000));
}
