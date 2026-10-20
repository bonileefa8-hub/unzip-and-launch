import { systemClock, type Clock } from "./types";

export type TimeIntent =
  | { kind: "time" }
  | { kind: "date"; dayOffset?: number }
  | { kind: "day"; dayOffset?: number }
  | { kind: "time_offset"; minutes: number }
  | { kind: "time_in_zone"; timeZone: string; label: string }
  | { kind: "unknown_zone"; label: string };

const ZONES: Record<string, string> = {
  london: "Europe/London",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  "new york": "America/New_York",
  "los angeles": "America/Los_Angeles",
  chicago: "America/Chicago",
  tokyo: "Asia/Tokyo",
  sydney: "Australia/Sydney",
  lagos: "Africa/Lagos",
  johannesburg: "Africa/Johannesburg",
  dubai: "Asia/Dubai",
  singapore: "Asia/Singapore",
  "hong kong": "Asia/Hong_Kong",
  mumbai: "Asia/Kolkata",
  utc: "UTC",
};

const NUM_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  "forty-five": 45,
  "forty five": 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};

const MAX_OFFSET_MINUTES = 60 * 24 * 365; // one year

/** Parse "30 minutes", "two hours", "an hour and a half", "half an hour". */
function parseDuration(s: string): number | null {
  if (/^half an? hour$/.test(s)) return 30;
  const m = s.match(
    /^(\d+(?:\.\d+)?|[a-z]+(?:[- ]five)?)\s+(minutes?|mins?|hours?|hrs?)(\s+and\s+a\s+half)?$/,
  );
  if (!m) return null;
  const n = /^\d/.test(m[1]!) ? Number(m[1]) : NUM_WORDS[m[1]!];
  if (n === undefined || !Number.isFinite(n) || n <= 0) return null;
  const unit = m[2]!.startsWith("h") ? 60 : 1;
  const total = Math.round((n + (m[3] ? 0.5 : 0)) * unit);
  return total > 0 && total <= MAX_OFFSET_MINUTES ? total : null;
}

/**
 * Detect simple, deterministic time/date questions. Patterns are anchored to the
 * whole utterance so questions like "What time does the store close?" fall
 * through to the AI provider instead of getting a wrong local answer.
 */
export function detectTimeIntent(raw: string): TimeIntent | null {
  const text = raw
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[?!.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(hey |ok |okay )?agent /, "")
    .replace(/^(please |can you tell me |could you tell me |do you know )/, "")
    .replace(/ please$/, "")
    .trim();

  const timeQ =
    "(?:what(?:'s| is) the (?:current )?time|what time is it|what time it is|the time|tell me the time|current time)";

  // "what time will it be in 30 minutes" / "what's the time in tokyo"
  const inMatch = text.match(
    new RegExp(
      `^(?:${timeQ}|what time will it be|what will the time be|what time would it be) in (.+?)(?: right now| now)?$`,
    ),
  );
  if (inMatch) {
    const target = inMatch[1]!.trim();
    const minutes = parseDuration(target);
    if (minutes !== null) return { kind: "time_offset", minutes };
    if (/\b(minutes?|mins?|hours?|hrs?)\b/.test(target)) return null; // unparseable/negative/huge duration
    const zone = ZONES[target];
    return zone
      ? { kind: "time_in_zone", timeZone: zone, label: target }
      : { kind: "unknown_zone", label: target };
  }

  if (new RegExp(`^${timeQ}(?: now| right now)?$`).test(text)) return { kind: "time" };

  const rel = "(?: (today|tomorrow|yesterday))?";
  const offsetOf = (w?: string) => (w === "tomorrow" ? 1 : w === "yesterday" ? -1 : 0);
  let m = text.match(
    new RegExp(
      `^(?:what(?:'s| is) (?:the )?date|what date is it|what(?:'s| is) today's date|today's date|the date)${rel}$`,
    ),
  );
  if (m) return { kind: "date", dayOffset: offsetOf(m[1]) };
  m = text.match(
    /^(?:what|which) day (?:is it|is|of the week is it|will it be|was it)(?: (today|tomorrow|yesterday))?$/,
  );
  if (m) return { kind: "day", dayOffset: offsetOf(m[1]) };
  return null;
}

export interface TimeServiceOptions {
  clock?: Clock;
  locale?: string;
  timeZone?: string; // IANA id; defaults to the system zone
  hour12?: boolean | undefined;
}

export class TimeService {
  private clock: Clock;
  locale: string;
  timeZone: string;
  hour12?: boolean | undefined;

  constructor(opts: TimeServiceOptions = {}) {
    this.clock = opts.clock ?? systemClock;
    this.locale = opts.locale ?? "en-US";
    this.timeZone = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.hour12 = opts.hour12;
  }

  now(): Date {
    return this.clock();
  }

  formatTime(date: Date, timeZone = this.timeZone): string {
    return new Intl.DateTimeFormat(this.locale, {
      hour: "numeric",
      minute: "2-digit",
      hour12: this.hour12,
      timeZone,
    }).format(date);
  }

  formatDate(date: Date, timeZone = this.timeZone): string {
    return new Intl.DateTimeFormat(this.locale, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone,
    }).format(date);
  }

  formatWeekday(date: Date, timeZone = this.timeZone): string {
    return new Intl.DateTimeFormat(this.locale, { weekday: "long", timeZone }).format(date);
  }

  /** Answer a detected intent using the real clock. */
  answer(intent: TimeIntent): string {
    const now = this.now();
    switch (intent.kind) {
      case "time":
        return `It's currently ${this.formatTime(now)}.`;
      case "date": {
        const off = intent.dayOffset ?? 0;
        const d = this.shiftDays(now, off);
        const word = off === 1 ? "Tomorrow will be" : off === -1 ? "Yesterday was" : "Today is";
        return `${word} ${this.formatDate(d)}.`;
      }
      case "day": {
        const off = intent.dayOffset ?? 0;
        const d = this.shiftDays(now, off);
        const word = off === 1 ? "Tomorrow is" : off === -1 ? "Yesterday was" : "It's";
        return `${word} ${this.formatWeekday(d)}.`;
      }
      case "time_offset": {
        const later = new Date(now.getTime() + intent.minutes * 60_000);
        const sameDay = this.formatDate(later) === this.formatDate(now);
        return `In ${describeMinutes(intent.minutes)} it will be ${this.formatTime(later)}${sameDay ? "" : `, on ${this.formatDate(later)}`}.`;
      }
      case "time_in_zone":
        return `It's ${this.formatTime(now, intent.timeZone)} in ${titleCase(intent.label)} (${intent.timeZone}).`;
      case "unknown_zone":
        return `I don't know the time zone for "${intent.label}" yet. Your local time is ${this.formatTime(now)}.`;
    }
  }

  /** Shift by 24h per day (can be off by one near midnight on a DST change day). */
  private shiftDays(now: Date, days: number): Date {
    return new Date(now.getTime() + days * 86_400_000);
  }
}

function describeMinutes(m: number): string {
  if (m % 60 === 0) return `${m / 60} hour${m === 60 ? "" : "s"}`;
  return `${m} minute${m === 1 ? "" : "s"}`;
}
function titleCase(s: string) {
  return s.length <= 3 ? s.toUpperCase() : s.replace(/\b\w/g, (c) => c.toUpperCase());
}
