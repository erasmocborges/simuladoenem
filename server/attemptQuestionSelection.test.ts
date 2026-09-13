import { describe, expect, it } from "vitest";
import { questions } from "../client/src/data/simulado";
import { ATTEMPT_AREA_ORDER, QUESTIONS_PER_AREA_PER_ATTEMPT, buildAttemptQuestions } from "../shared/attemptQuestionSelection";

function hasOverlap(first: ReadonlySet<string>, second: ReadonlySet<string>) {
  return [...first].some((id) => second.has(id));
}

describe("buildAttemptQuestions", () => {
  const studentKey = "aluno-teste";

  it("organiza 25 questões de cada área nos blocos de numeração definidos", () => {
    const attempt = buildAttemptQuestions(questions, studentKey, 1);

    expect(attempt).toHaveLength(100);
    ATTEMPT_AREA_ORDER.forEach((area, blockIndex) => {
      const start = blockIndex * QUESTIONS_PER_AREA_PER_ATTEMPT;
      const block = attempt.slice(start, start + QUESTIONS_PER_AREA_PER_ATTEMPT);

      expect(block).toHaveLength(QUESTIONS_PER_AREA_PER_ATTEMPT);
      expect(block.every((question) => question.area === area)).toBe(true);
      expect(block.map((question) => question.numero)).toEqual(Array.from({ length: QUESTIONS_PER_AREA_PER_ATTEMPT }, (_, index) => start + index + 1));
    });
  });

  it("embaralha a ordem somente dentro de cada bloco", () => {
    const attempt = buildAttemptQuestions(questions, studentKey, 1);

    ATTEMPT_AREA_ORDER.forEach((area, blockIndex) => {
      const block = attempt.slice(blockIndex * QUESTIONS_PER_AREA_PER_ATTEMPT, (blockIndex + 1) * QUESTIONS_PER_AREA_PER_ATTEMPT);
      const sourceOrder = questions.filter((question) => question.area === area).slice(0, QUESTIONS_PER_AREA_PER_ATTEMPT).map((question) => question.id);

      expect(block.map((question) => question.id)).not.toEqual(sourceOrder);
    });
  });

  it("preserva o identificador original ao renumerar as questões da tentativa", () => {
    const attempt = buildAttemptQuestions(questions, "aluno-teste", 1);
    const bankIds = new Set(questions.map((question) => question.id));

    expect(attempt).toHaveLength(100);
    expect(attempt.map((question) => question.numero)).toEqual(Array.from({ length: 100 }, (_, index) => index + 1));
    expect(attempt.every((question) => bankIds.has(question.id))).toBe(true);
    expect(new Set(attempt.map((question) => question.id))).toHaveLength(100);
    expect(attempt.some((question) => question.numero !== Number(question.id.slice(-4)))).toBe(true);
  });

  it("não repete questões entre as três tentativas enquanto o banco da área comportar", () => {
    const attempts = [1, 2, 3].map((attemptNumber) => buildAttemptQuestions(questions, studentKey, attemptNumber));

    ATTEMPT_AREA_ORDER.forEach((area, blockIndex) => {
      const start = blockIndex * QUESTIONS_PER_AREA_PER_ATTEMPT;
      const idsByAttempt = attempts.map((attempt) => new Set(attempt.slice(start, start + QUESTIONS_PER_AREA_PER_ATTEMPT).map((question) => question.id)));

      expect(hasOverlap(idsByAttempt[0], idsByAttempt[1])).toBe(false);
      expect(hasOverlap(idsByAttempt[0], idsByAttempt[2])).toBe(false);
      expect(hasOverlap(idsByAttempt[1], idsByAttempt[2])).toBe(false);
      expect(new Set(idsByAttempt.flatMap((ids) => [...ids])).size).toBe(QUESTIONS_PER_AREA_PER_ATTEMPT * 3);
      expect(attempts.every((attempt) => attempt.slice(start, start + QUESTIONS_PER_AREA_PER_ATTEMPT).every((question) => question.area === area))).toBe(true);
    });
  });
});
