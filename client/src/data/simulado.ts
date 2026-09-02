export type Question = {
  numero: number; area: string; areaCurta: string; habilidade: string; referencia: string;
  enunciado: string; alternativas: { A: string; B: string; C: string; D: string }; correta: string; justificativa: string;
};

import bank from './simulado-bank.json';

export const questions = bank as Question[];

export const areaSummary = [
  { area: 'Linguagens, Códigos e suas Tecnologias', short: 'Linguagens', count: 375 },
  { area: 'Ciências Humanas e suas Tecnologias', short: 'Ciências Humanas', count: 375 },
  { area: 'Ciências da Natureza e suas Tecnologias', short: 'Ciências da Natureza', count: 375 },
  { area: 'Matemática e suas Tecnologias', short: 'Matemática', count: 375 },
];
