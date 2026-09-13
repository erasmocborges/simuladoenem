import { describe, expect, it } from "vitest";
import { getDailyAttemptCycle, localDayKey } from "../shared/dailyAttemptCycle";
import { ATTEMPT_AREA_ORDER, buildAttemptQuestions } from "../shared/attemptQuestionSelection";
import { questions } from "../client/src/data/simulado";

const studentKey = "aluna-teste";
const today = new Date(2026, 8, 13, 12);
const yesterday = new Date(2026, 8, 12, 12);

function attempt(id: string, createdAt: Date) {
  return {
    id,
    studentKey,
    createdAt: createdAt.toISOString(),
    correct: 80,
    answers: { 1: "A" },
    questionIds: { 1: "simulado-enem-0001" },
  };
}

describe("ciclo diário de tentativas", () => {
  it("conta a primeira, segunda e terceira tentativas do dia", () => {
    expect(getDailyAttemptCycle([], studentKey, today)).toMatchObject({ attemptsUsed: 0, attemptsRemaining: 3, currentAttemptNumber: 1, maxAttemptsReached: false });
    expect(getDailyAttemptCycle([attempt("1", today)], studentKey, today)).toMatchObject({ attemptsUsed: 1, attemptsRemaining: 2, currentAttemptNumber: 2, maxAttemptsReached: false });
    expect(getDailyAttemptCycle([attempt("1", today), attempt("2", today)], studentKey, today)).toMatchObject({ attemptsUsed: 2, attemptsRemaining: 1, currentAttemptNumber: 3, maxAttemptsReached: false });
  });

  it("bloqueia a quarta tentativa no mesmo dia", () => {
    const attempts = [attempt("1", today), attempt("2", today), attempt("3", today)];
    const cycle = getDailyAttemptCycle(attempts, studentKey, today);

    expect(cycle).toMatchObject({ attemptsUsed: 3, attemptsRemaining: 0, currentAttemptNumber: 3, maxAttemptsReached: true });
  });

  it("libera três novas tentativas no dia seguinte sem apagar o histórico", () => {
    const history = [attempt("ontem", yesterday), attempt("hoje-1", today), attempt("hoje-2", today), attempt("hoje-3", today)];
    const tomorrow = new Date(2026, 8, 14, 12);
    const cycle = getDailyAttemptCycle(history, studentKey, tomorrow);

    expect(cycle).toMatchObject({ attemptsUsed: 0, attemptsRemaining: 3, currentAttemptNumber: 1, maxAttemptsReached: false });
    expect(history).toHaveLength(4);
    expect(history.find((item) => item.id === "ontem")).toMatchObject({ createdAt: yesterday.toISOString(), answers: { 1: "A" }, questionIds: { 1: "simulado-enem-0001" } });
    expect(localDayKey(new Date(history[0].createdAt))).toBe(localDayKey(yesterday));
  });

  it("usa as tentativas 1 a 3 do ciclo diário sem repetir questões e preservando os IDs", () => {
    const dailyAttempts = [1, 2, 3].map((attemptNumber) => buildAttemptQuestions(questions, studentKey, attemptNumber));

    ATTEMPT_AREA_ORDER.forEach((area, blockIndex) => {
      const seenIds = new Set<string>();
      dailyAttempts.forEach((questionsInAttempt) => {
        const block = questionsInAttempt.slice(blockIndex * 25, blockIndex * 25 + 25);
        expect(block).toHaveLength(25);
        expect(block.every((question) => question.area === area && question.id.startsWith("simulado-enem-"))).toBe(true);
        block.forEach((question) => seenIds.add(question.id));
      });
      expect(seenIds).toHaveLength(75);
    });
  });
});
