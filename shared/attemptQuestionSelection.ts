import type { Question } from "../client/src/data/simulado";

export const QUESTIONS_PER_AREA_PER_ATTEMPT = 25;
export const ATTEMPT_AREA_COUNT = 4;
export const ATTEMPT_QUESTION_COUNT = QUESTIONS_PER_AREA_PER_ATTEMPT * ATTEMPT_AREA_COUNT;

const LETTERS = ["A", "B", "C", "D"] as const;
type Letter = (typeof LETTERS)[number];

type SeedSource = string | number;

function hashSeed(...parts: SeedSource[]) {
  let hash = 2166136261;
  for (const part of parts) {
    const text = String(part);
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

function nextRandom(state: { value: number }) {
  state.value += 0x6D2B79F5;
  let value = state.value;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}

export function seededShuffle<T>(items: readonly T[], ...seed: SeedSource[]) {
  const result = [...items];
  const state = { value: hashSeed(...seed) };
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom(state) * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function shuffleAlternatives(question: Question, studentKey: string, attemptNumber: number) {
  const shuffledLetters = seededShuffle(LETTERS, studentKey, attemptNumber, question.numero, "alternatives");
  const alternatives = {} as Question["alternativas"];
  let correta: Letter = "A";
  shuffledLetters.forEach((sourceLetter, index) => {
    const targetLetter = LETTERS[index];
    alternatives[targetLetter] = question.alternativas[sourceLetter];
    if (sourceLetter === question.correta) correta = targetLetter;
  });
  return { ...question, alternativas: alternatives, correta };
}

export function buildAttemptQuestions(bank: readonly Question[], studentKey: string, attemptNumber: number) {
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new Error("A tentativa deve ser um número inteiro positivo.");
  const areas = Array.from(new Set(bank.map((question) => question.area)));
  if (areas.length !== ATTEMPT_AREA_COUNT) throw new Error(`O banco deve conter ${ATTEMPT_AREA_COUNT} áreas.`);
  const chosenByArea = areas.map((area) => {
    const pool = bank.filter((question) => question.area === area);
    const shuffledPool = seededShuffle(pool, studentKey, area, "pool");
    const start = (attemptNumber - 1) * QUESTIONS_PER_AREA_PER_ATTEMPT;
    const end = start + QUESTIONS_PER_AREA_PER_ATTEMPT;
    if (shuffledPool.length < end) throw new Error(`A área ${area} não tem questões suficientes para a tentativa ${attemptNumber}.`);
    return shuffledPool.slice(start, end);
  });
  const selected = chosenByArea.flatMap((items) => items).map((question) => shuffleAlternatives(question, studentKey, attemptNumber));
  return seededShuffle(selected, studentKey, attemptNumber, "order").map((question, index) => ({ ...question, numero: index + 1 }));
}
