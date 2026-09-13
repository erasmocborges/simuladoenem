export const MAX_DAILY_ATTEMPTS = 3;

export type DailyAttemptRecord = {
  studentKey: string;
  createdAt: string;
};

export function localDayKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

export function isCurrentLocalDay(createdAt: string, now = new Date()) {
  const date = new Date(createdAt);
  return !Number.isNaN(date.getTime()) && localDayKey(date) === localDayKey(now);
}

export function getDailyAttemptCycle<T extends DailyAttemptRecord>(attempts: readonly T[], studentKey: string, now = new Date()) {
  const today = localDayKey(now);
  const todayAttempts = attempts.filter((attempt) => {
    return attempt.studentKey === studentKey && isCurrentLocalDay(attempt.createdAt, now);
  });
  const attemptsUsed = todayAttempts.length;

  return {
    todayAttempts,
    attemptsUsed,
    attemptsRemaining: Math.max(0, MAX_DAILY_ATTEMPTS - attemptsUsed),
    maxAttemptsReached: attemptsUsed >= MAX_DAILY_ATTEMPTS,
    currentAttemptNumber: Math.min(attemptsUsed + 1, MAX_DAILY_ATTEMPTS),
  };
}
