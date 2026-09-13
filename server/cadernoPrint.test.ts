import { describe, expect, it } from "vitest";
import { cadernoPdfFilename, paginateCadernoForPrint, selectCadernoPrintBlocks, type CadernoPrintBlock } from "../shared/cadernoPrint";
import { calculateSimulationScore } from "../shared/simulationScoring";
import { questions } from "../client/src/data/simulado";
import { buildAttemptQuestions } from "../shared/attemptQuestionSelection";

describe("materiais docentes do caderno", () => {
  const attemptQuestions = buildAttemptQuestions(questions, "professor-teste", 1);
  const blocks: CadernoPrintBlock[] = [
    { id: "dia-1", startQuestion: 1, endQuestion: 50 },
    { id: "dia-2", startQuestion: 51, endQuestion: 100 },
  ];

  it("organiza as 100 questões em 25 páginas de quatro itens para impressão", () => {
    const pages = paginateCadernoForPrint(attemptQuestions);
    expect(pages).toHaveLength(25);
    expect(pages.every((page) => page.length === 4)).toBe(true);
    expect(pages.flat().map((question) => question.numero)).toEqual(attemptQuestions.map((question) => question.numero));
    expect(pages.flat().map((question) => question.id)).toEqual(attemptQuestions.map((question) => question.id));
  });

  it("seleciona somente os blocos solicitados e preserva a ordem das questões", () => {
    const secondBlock = selectCadernoPrintBlocks(attemptQuestions, blocks, ["dia-2"]);
    expect(secondBlock).toHaveLength(50);
    expect(secondBlock[0]?.numero).toBe(51);
    expect(secondBlock.at(-1)?.numero).toBe(100);
    expect(paginateCadernoForPrint(secondBlock)).toHaveLength(13);
  });

  it("monta um nome de PDF estável e identificável", () => {
    expect(cadernoPdfFilename(new Date(2026, 7, 27))).toBe("simulado-enem-caderno-2026-08-27.pdf");
  });

  it("confere a pontuação completa e o detalhamento das quatro áreas", () => {
    const answers = Object.fromEntries(attemptQuestions.map((question) => [question.numero, question.correta]));
    const result = calculateSimulationScore(attemptQuestions, answers);

    expect(result).toMatchObject({ total: 100, answered: 100, correct: 100, percentage: 100 });
    expect(result.byArea).toHaveLength(4);
    expect(result.byArea.every((area) => area.correct === 25 && area.answered === 25 && area.blank === 0 && area.percentage === 100)).toBe(true);
  });

  it("distingue uma resposta correta isolada sem inflar o percentual", () => {
    const firstQuestion = attemptQuestions[0];
    const result = calculateSimulationScore(attemptQuestions, { [firstQuestion.numero]: firstQuestion.correta });

    expect(result).toMatchObject({ total: 100, answered: 1, correct: 1, percentage: 1 });
    expect(result.byArea.find((area) => area.area === firstQuestion.area)).toMatchObject({ correct: 1, answered: 1, blank: 24, percentage: 4 });
  });
});
