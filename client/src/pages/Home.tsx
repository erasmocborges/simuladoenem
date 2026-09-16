/**
 * Caderno de Campo PedagÃ³gico â€” pÃ¡gina editorial assimÃ©trica em papel mineral,
 * tinta azul-marinho e acentos Vermelho Caderno. Leitura clara antes de decoraÃ§Ã£o.
 */
import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import {
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileDown,
  FileText,
  Filter,
  GraduationCap,
  History,
  Info,
  LockKeyhole,
  Menu,
  Medal,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Search,
  Timer,
  Trophy,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { StudentAuthDialog } from "@/components/StudentAuthDialog";
import { questions, areaSummary, type Question } from "@/data/simulado";
import { useAuth } from "@/_core/hooks/useAuth";
import { loadRemoteProgress, saveRemoteProgress } from "@/lib/progressApi";
import { hasInstitutionalTeacherAccess } from "@shared/identityRoles";
import { cadernoPdfFilename, paginateCadernoForPrint, selectCadernoPrintBlocks, type CadernoPrintBlock } from "@shared/cadernoPrint";
import { calculateSimulationScore } from "@shared/simulationScoring";
import { ATTEMPT_QUESTION_COUNT, QUESTIONS_PER_AREA_PER_ATTEMPT, buildAttemptQuestions } from "@shared/attemptQuestionSelection";
import { MAX_DAILY_ATTEMPTS, getDailyAttemptCycle, isCurrentLocalDay } from "@shared/dailyAttemptCycle";

type AreaName = (typeof questions)[number]["area"];
type FilterArea = AreaName | "Todas";
type DownloadMode = "caderno" | "gabarito" | "mascara";
type CadernoOutputMode = "print" | "pdf";
type AttemptArea = { short: string; correct: number; answered: number; blank: number; percentage: number };
type Attempt = {
  id: string;
  studentKey: string;
  studentName: string;
  classroomKey: string;
  classroom: string;
  createdAt: string;
  correct: number;
  answered: number;
  percentage: number;
  remainingSeconds: number;
  byArea: AttemptArea[];
  answers: Record<number, string>;
  questionIds?: Record<number, string>;
};

const areaMeta: Record<AreaName, { short: string; color: string; pale: string; bar: string; index: string }> = {
  "Linguagens, Códigos e suas Tecnologias": { short: "Linguagens", color: "#C84D3A", pale: "#F5E1D9", bar: "#C84D3A", index: "01" },
  "Ciências Humanas e suas Tecnologias": { short: "Humanas", color: "#8A6B2D", pale: "#F1E8CC", bar: "#B28A3A", index: "02" },
  "Ciências da Natureza e suas Tecnologias": { short: "Natureza", color: "#497464", pale: "#DDEBE5", bar: "#5D8C78", index: "03" },
  "Matemática e suas Tecnologias": { short: "Matemática", color: "#1D4C72", pale: "#DDE8F1", bar: "#3B709D", index: "04" },
};

function getAreaMeta(area: string) {
  const normalized = area.trim().normalize("NFC");

  return areaMeta[normalized as AreaName] ?? {
    short: area || "Área",
    color: "#64748B",
    pale: "#F1F5F9",
    bar: "#64748B",
    index: "--",
  };
}
const chartColors = ["#C84D3A", "#B28A3A", "#5D8C78", "#3B709D"];
const operationData = [
  { name: "Leitura e argumentaÃ§Ã£o", value: 32 },
  { name: "Modelagem e cÃ¡lculo", value: 25 },
  { name: "AnÃ¡lise de fenÃ´menos", value: 25 },
  { name: "Contexto histÃ³rico-social", value: 18 },
];

type TimerPreset = "dia1" | "dia2";

const timerPresets: Record<TimerPreset, { label: string; seconds: number }> = {
  dia1: { label: "1.Âº dia Â· 5h30", seconds: 5 * 60 * 60 + 30 * 60 },
  dia2: { label: "2.Âº dia Â· 5h", seconds: 5 * 60 * 60 },
};

const ATTEMPTS_STORAGE_KEY = "simulado-enem-attempts-v1";
const PROFILE_STORAGE_KEY = "simulado-enem-profile-v1";
const PROGRESS_STORAGE_KEY = "simulado-enem-progress-v1";
const attemptAreaSummary = areaSummary.map((entry) => ({ ...entry, count: QUESTIONS_PER_AREA_PER_ATTEMPT }));

const CADERNO_PRINT_BLOCKS: Array<CadernoPrintBlock & { label: string; description: string }> = [
  { id: "dia-1", startQuestion: 1, endQuestion: 50, label: "Bloco 1 Â· Linguagens e Humanas", description: "QuestÃµes 01â€“50 Â· aplicaÃ§Ã£o do 1.Âº dia" },
  { id: "dia-2", startQuestion: 51, endQuestion: 100, label: "Bloco 2 Â· Natureza e MatemÃ¡tica", description: "QuestÃµes 51â€“100 Â· aplicaÃ§Ã£o do 2.Âº dia" },
];

function normalizeIdentity(value: string, fallback: string) {
  return (value.trim() || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

function initialAttempts(): Attempt[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = JSON.parse(window.localStorage.getItem(ATTEMPTS_STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function initialProfile() {
  const emptyProfile = { studentEmail: "", studentName: "", classroom: "", localId: "servidor" };
  if (typeof window === "undefined") return emptyProfile;
  try {
    const stored = JSON.parse(window.localStorage.getItem(PROFILE_STORAGE_KEY) || "{}");
    return { studentEmail: typeof stored.studentEmail === "string" ? stored.studentEmail : "", studentName: typeof stored.studentName === "string" ? stored.studentName : "", classroom: typeof stored.classroom === "string" ? stored.classroom : "", localId: typeof stored.localId === "string" ? stored.localId : `perfil-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  } catch {
    return { ...emptyProfile, localId: `perfil-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
  }
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function csvCell(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function markdownFor(mode: DownloadMode, sourceQuestions: readonly Question[] = questions) {
  const documentTitle = {
    caderno: "SIMULADO ENEM â€” Caderno de QuestÃµes",
    gabarito: "SIMULADO ENEM â€” Gabarito Comentado",
    mascara: "SIMULADO ENEM â€” Folha de Respostas e MÃ¡scara de CorreÃ§Ã£o",
  }[mode];
  const header = `# ${documentTitle}\n\nEscola: ________________________________________________________________\nProfessor(a): ___________________________________________________________\nEstudante: _____________________________________________________________\nTurma: ____________________    Data: ____ / ____ / ______\n\n`;

  if (mode === "caderno") {
    return header + `> Material autoral reformulado, elaborado a partir de habilidades, temas e estruturas recorrentes em provas oficiais do ENEM.\n\n` + sourceQuestions.map((q) => `## QuestÃ£o ${String(q.numero).padStart(2, "0")} â€” ${q.areaCurta}\n\n${q.enunciado}\n\nA. ${q.alternativas.A}\n\nB. ${q.alternativas.B}\n\nC. ${q.alternativas.C}\n\nD. ${q.alternativas.D}\n`).join("\n---\n\n");
  }
  if (mode === "gabarito") {
    return header + sourceQuestions.map((q) => `| ${String(q.numero).padStart(3, "0")} | **${q.correta}** | ${q.habilidade} | ${q.justificativa} |`).join("\n").replace(/^/, "| QuestÃ£o | Resposta | Habilidade | Justificativa |\n| ---: | :---: | --- | --- |\n");
  }
  return header + `## CartÃ£o-resposta\n\n| QuestÃ£o | A | B | C | D |\n| ---: | :---: | :---: | :---: | :---: |\n${sourceQuestions.map((q) => `| ${String(q.numero).padStart(3, "0")} | â—‹ | â—‹ | â—‹ | â—‹ |`).join("\n")}\n\n---\n\n## Chave de correÃ§Ã£o\n\n| QuestÃ£o | Resposta |\n| ---: | :---: |\n${sourceQuestions.map((q) => `| ${String(q.numero).padStart(3, "0")} | **${q.correta}** |`).join("\n")}`;
}

function downloadFile(mode: DownloadMode, sourceQuestions: readonly Question[] = questions) {
  const blob = new Blob([markdownFor(mode, sourceQuestions)], { type: "text/markdown;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `simulado-enem-${mode}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] || character);
}

function printableCadernoHtml(selectedQuestions: readonly Question[], selectionLabel: string) {
  const pages = paginateCadernoForPrint(selectedQuestions);
  return pages.map((page, pageIndex) => {
    const questionHtml = page.map((question) => `
      <article class="print-question">
        <div class="print-question-meta"><strong>QuestÃ£o ${String(question.numero).padStart(2, "0")}</strong><span>${escapeHtml(question.areaCurta)}</span></div>
        <p class="print-stem">${escapeHtml(question.enunciado)}</p>
        <ol class="print-alternatives" type="A">
          ${(["A", "B", "C", "D"] as const).map((letter) => `<li>${escapeHtml(question.alternativas[letter])}</li>`).join("")}
        </ol>
      </article>`).join("");
    const identification = pageIndex === 0 ? `<div class="print-identification"><span>Escola: ______________________________________________</span><span>Professor(a): ________________________________________</span><span>Estudante: __________________________________________</span><span>Turma: ____________________ Data: ____ / ____ / ______</span></div>` : "";
    return `<section class="print-page"><header class="print-page-header"><span>SIMULADO ENEM INTERATIVO</span><strong>Caderno de questÃµes</strong><span>Folha ${String(pageIndex + 1).padStart(2, "0")} de ${String(pages.length).padStart(2, "0")}</span></header><p class="print-selection">${escapeHtml(selectionLabel)}</p>${identification}${questionHtml}<footer class="print-page-footer"><span>Material autoral reformulado para aplicaÃ§Ã£o pedagÃ³gica.</span><span>${pageIndex + 1} / ${pages.length}</span></footer></section>`;
  }).join("");
}

function printPreview(selectedQuestions: readonly Question[], selectionLabel: string) {
  if (!selectedQuestions.length) return false;
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return false;
  printWindow.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Simulado ENEM â€” Caderno</title><style>@page{size:A4;margin:12mm 14mm}*{box-sizing:border-box}body{margin:0;background:#eef0f2;color:#182940;font-family:Arial,sans-serif}.print-page{position:relative;min-height:273mm;overflow:hidden;background:#fff;padding:0 0 15mm;page-break-after:always;break-after:page}.print-page:last-child{page-break-after:auto;break-after:auto}.print-page-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:9mm;border-top:3px solid #c84d3a;border-bottom:1px solid #cdd4db;padding:3mm 0 3.4mm;color:#546477;font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.print-page-header strong{color:#1d2a44;font-size:9pt;letter-spacing:.025em;text-transform:none}.print-page-header span:last-child{text-align:right}.print-selection{margin:3mm 0 0;color:#6a7888;font-size:7.5pt;font-weight:700;letter-spacing:.05em;text-transform:uppercase}.print-identification{display:grid;grid-template-columns:1fr 1fr;gap:3.3mm 8mm;margin:5mm 0 4mm;border:1px solid #d6dce0;padding:3.5mm 4mm;color:#3f5066;font-size:8.2pt;line-height:1.25}.print-question{break-inside:avoid;page-break-inside:avoid;padding:4.5mm 0 4.3mm;border-bottom:1px solid #dce1e5}.print-question-meta{display:flex;justify-content:space-between;gap:7mm;color:#6a7888;font-size:7.5pt;text-transform:uppercase;letter-spacing:.075em}.print-question-meta strong{color:#c84d3a;font-size:9.4pt;letter-spacing:.03em}.print-stem{margin:2.2mm 0 2.6mm;color:#1d2a44;font-size:9.8pt;line-height:1.4}.print-alternatives{display:grid;grid-template-columns:1fr 1fr;gap:1.6mm 8mm;margin:0;padding-left:5mm;color:#33455a;font-size:8.9pt;line-height:1.35}.print-alternatives li{padding-left:1mm}.print-page-footer{position:absolute;right:0;bottom:0;left:0;display:flex;justify-content:space-between;border-top:1px solid #d6dce0;padding-top:2.5mm;color:#718092;font-size:7.2pt}@media screen{body{padding:16px}.print-page{width:182mm;min-height:273mm;margin:0 auto 16px;padding:12mm 14mm 15mm;box-shadow:0 5px 18px rgba(22,37,55,.16)}}@media print{body{background:#fff}.print-page{width:auto;margin:0;padding:0 0 15mm;box-shadow:none}}</style></head><body>${printableCadernoHtml(selectedQuestions, selectionLabel)}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
  return true;
}
function StudentAccessGate({ onLogin }: { onLogin: () => void }) {
  return (
    <div
      className="student-access-gate"
      role="region"
      aria-labelledby="student-access-title"
    >
      <div className="student-access-icon">
        <UserRound size={22} />
      </div>

      <div className="student-access-copy">
        <span className="mini-label">ACESSO DO ALUNO</span>

        <h3 id="student-access-title">
          Entre para iniciar o simulado.
        </h3>

        <p>
          Conecte sua conta Google para salvar seu progresso,
          suas tentativas e seu histórico.
        </p>
      </div>

      <button
        type="button"
        className="timer-start"
        onClick={onLogin}
      >
        Entrar com Google
        <ArrowRight size={15} />
      </button>
    </div>
  );
}

function QuestionCard({ q, selected, onSelect, revealed, onReveal, canReveal, disabled }: { q: Question; selected?: string; onSelect: (answer: string) => void; revealed: boolean; onReveal: () => void; canReveal: boolean; disabled: boolean }) {
const meta = getAreaMeta(q.area);
  return (
    <article className="question-card" style={{ "--question-color": meta.color, "--question-pale": meta.pale } as React.CSSProperties}>
      <div className="question-meta">
        <span className="question-number">{String(q.numero).padStart(2, "0")}</span>
        <span className="topic-chip" style={{ backgroundColor: meta.pale, color: meta.color }}>{q.habilidade}</span>
        <span className="question-reference">{q.referencia}</span>
      </div>
      <p className="question-stem">{q.enunciado}</p>
      <div className="alternatives" role="radiogroup" aria-label={`Alternativas da questÃ£o ${q.numero}`}>
        {(["A", "B", "C", "D"] as const).map((letter) => {
          const isSelected = selected === letter;
          const isCorrect = revealed && q.correta === letter;
          const isWrong = revealed && isSelected && q.correta !== letter;
          return (
            <button key={letter} disabled={disabled} className={`alternative ${isSelected ? "selected" : ""} ${isCorrect ? "correct" : ""} ${isWrong ? "wrong" : ""}`} onClick={() => onSelect(letter)} role="radio" aria-checked={isSelected}>
              <span>{letter}</span><span>{q.alternativas[letter]}</span>
              {isCorrect && <Check size={16} strokeWidth={2.8} />}
            </button>
          );
        })}
      </div>
      <div className="question-footer">
        <span>ReferÃªncia curricular: <strong>{q.areaCurta}</strong></span>
        {canReveal ? <button className="reveal-button" onClick={onReveal}>{revealed ? `Resposta: ${q.correta}` : "Ver resposta comentada"}</button> : <span className="answer-locked">Finalize a correÃ§Ã£o para consultar o comentÃ¡rio.</span>}
      </div>
      {revealed && <p className="answer-explanation"><strong>Por quÃª?</strong> {q.justificativa}</p>}
    </article>
  );
}

export default function Home() {
  const { user, loading, isAuthenticated, login, signup, recover, requiresPasswordReset, completePasswordRecovery, logout, refresh } = useAuth();

  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInitialMode, setAuthInitialMode] = useState<"login" | "signup">("login");
  const [authContext, setAuthContext] = useState<"student" | "developer">("student");
  const profile = useMemo(() => initialProfile(), []);
  const [activeArea, setActiveArea] = useState<FilterArea>("Todas");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [showKey, setShowKey] = useState(false);
  const [studentName, setStudentName] = useState(profile.studentName);
  const [classroom, setClassroom] = useState(profile.classroom);
  const [localProfileId] = useState(profile.localId);
  const [submitted, setSubmitted] = useState(false);
  const [timerPreset, setTimerPreset] = useState<TimerPreset>("dia1");
  const [remainingSeconds, setRemainingSeconds] = useState(timerPresets.dia1.seconds);
  const [timerRunning, setTimerRunning] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[]>(initialAttempts);
  const [cycleDate, setCycleDate] = useState(() => new Date());
  const [reviewOpen, setReviewOpen] = useState(false);
  const [progressNotice, setProgressNotice] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("todas");
  const [teacherSort, setTeacherSort] = useState("score");
  const [syncState, setSyncState] = useState<"local" | "syncing" | "cloud" | "error">("local");
  const [remotePayload, setRemotePayload] = useState<string | null>(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [cadernoOutputMode, setCadernoOutputMode] = useState<CadernoOutputMode>("print");
  const [selectedCadernoBlocks, setSelectedCadernoBlocks] = useState<string[]>(() => CADERNO_PRINT_BLOCKS.map((block) => block.id));
 const teacherMode = hasInstitutionalTeacherAccess(user);
const accessUnlocked = teacherMode || isAuthenticated;
const studentKey = user?.id || localProfileId;
  const classroomKey = normalizeIdentity(classroom, "turma-local");
  const studentAttempts = attempts.filter((attempt) => attempt.studentKey === studentKey);
  const { attemptsUsed, attemptsRemaining, maxAttemptsReached, currentAttemptNumber } = getDailyAttemptCycle(attempts, studentKey, cycleDate);
  const attemptQuestions = useMemo(() => accessUnlocked ? buildAttemptQuestions(questions, studentKey, currentAttemptNumber) : [], [accessUnlocked, studentKey, currentAttemptNumber]);
  const openAuth = (mode: "login" | "signup", context: "student" | "developer" = "student") => {
    setAuthInitialMode(mode);
    setAuthContext(context);
    setAuthOpen(true);
  };
  const loginFromDialog = async (email: string, password: string) => {
    await login(email, password);
    if (authContext !== "developer") return;
    const current = await refresh();
    if (hasInstitutionalTeacherAccess(current)) return;
    await logout().catch(() => undefined);
    throw new Error("developer-role-required");
  };

  const filteredQuestions = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("pt-BR");
    return attemptQuestions.filter((q) => {
      const matchArea = activeArea === "Todas" || q.area === activeArea;
      const searchable = `${q.enunciado} ${q.habilidade} ${q.referencia}`.toLocaleLowerCase("pt-BR");
      return matchArea && (!needle || searchable.includes(needle));
    });
  }, [activeArea, attemptQuestions, query]);

  const pageSize = 5;
  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / pageSize));
  const currentQuestions = filteredQuestions.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [activeArea, query]);

  useEffect(() => {
    if (!timerRunning || remainingSeconds <= 0) return;
    const interval = window.setInterval(() => setRemainingSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning, remainingSeconds]);

  useEffect(() => {
    if (remainingSeconds === 0) setTimerRunning(false);
  }, [remainingSeconds]);

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timeout = window.setTimeout(() => setCycleDate(new Date()), nextDay.getTime() - now.getTime() + 100);
    return () => window.clearTimeout(timeout);
  }, [cycleDate]);

  useEffect(() => {
    window.localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(attempts));
  }, [attempts]);

    useEffect(() => {
    try {
      const draft = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) || "null");
      if (draft?.answers && typeof draft.savedAt === "string" && isCurrentLocalDay(draft.savedAt)) { setAnswers(draft.answers); setRemainingSeconds(draft.remainingSeconds ?? timerPresets.dia1.seconds); setProgressNotice("Progresso anterior restaurado."); }
    } catch { /* ignorar rascunho invÃ¡lido */ }
  }, []);

  useEffect(() => {
    let active = true;
    if (!isAuthenticated) {
      setRemotePayload(null);
      setSyncState("local");
      return () => { active = false; };
    }
    setSyncState("syncing");
    void loadRemoteProgress()
      .then((result) => {
        if (!active) return;
        setRemotePayload(result.payload);
        setSyncState("cloud");
      })
      .catch(() => {
        if (active) setSyncState("error");
      });
    return () => { active = false; };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (!remotePayload) return;
    try {
      const synced = JSON.parse(remotePayload);
      if (synced.answers) setAnswers(synced.answers);
      if (typeof synced.remainingSeconds === "number") setRemainingSeconds(synced.remainingSeconds);
      if (typeof synced.studentName === "string") setStudentName(synced.studentName);
      if (typeof synced.classroom === "string") setClassroom(synced.classroom);
      if (Array.isArray(synced.attempts)) setAttempts(synced.attempts);
      setSyncState("cloud");
      setProgressNotice("Progresso sincronizado com sua conta.");
    } catch { /* ignorar dados remotos invÃ¡lidos */ }
  }, [remotePayload]);

  const simulationScore = useMemo(() => calculateSimulationScore(attemptQuestions, answers), [attemptQuestions, answers]);
  const attemptPrintQuestions = useMemo(() => attemptQuestions.map((question, index) => ({ ...question, numero: index + 1 })), [attemptQuestions]);
  const selectedCadernoQuestions = useMemo(() => selectCadernoPrintBlocks(attemptPrintQuestions, CADERNO_PRINT_BLOCKS, selectedCadernoBlocks), [attemptPrintQuestions, selectedCadernoBlocks]);
  const selectedCadernoPages = useMemo(() => paginateCadernoForPrint(selectedCadernoQuestions), [selectedCadernoQuestions]);
  const selectedCadernoLabel = useMemo(() => CADERNO_PRINT_BLOCKS.filter((block) => selectedCadernoBlocks.includes(block.id)).map((block) => block.label.replace("Bloco ", "B.")).join(" Â· "), [selectedCadernoBlocks]);
  const areaPerformance = simulationScore.byArea;
  const totalAnswered = simulationScore.answered;
  const totalCorrect = simulationScore.correct;
  const overallPercentage = simulationScore.percentage;
  const isCriticalTime = remainingSeconds > 0 && remainingSeconds <= 10 * 60;
  const isTimeOver = remainingSeconds === 0;
  const classAttempts = attempts.filter((attempt) => attempt.classroomKey === classroomKey);
  const uniqueStudentsInClass = new Set(classAttempts.map((attempt) => attempt.studentKey)).size;
  const classAverage = classAttempts.length ? Math.round(classAttempts.reduce((sum, attempt) => sum + attempt.percentage, 0) / classAttempts.length) : 0;
  const anonymousRanking = useMemo(() => {
    const recordsByStudent = new Map<string, Attempt[]>();
    classAttempts.forEach((attempt) => recordsByStudent.set(attempt.studentKey, [...(recordsByStudent.get(attempt.studentKey) || []), attempt]));
    return Array.from(recordsByStudent.values())
      .map((records: Attempt[]) => ({ best: Math.max(...records.map((record: Attempt) => record.percentage)), attempts: records.length }))
      .sort((a, b) => b.best - a.best)
      .map((record, index) => ({ ...record, label: `Participante ${String.fromCharCode(65 + index)}` }));
  }, [classAttempts]);
  const teacherRows = useMemo(() => attempts.filter((attempt) => teacherFilter === "todas" || attempt.classroomKey === teacherFilter).sort((a, b) => teacherSort === "score" ? b.percentage - a.percentage : +new Date(b.createdAt) - +new Date(a.createdAt)), [attempts, teacherFilter, teacherSort]);
  const teacherClassrooms = useMemo(() => Array.from(new Map(attempts.map((attempt) => [attempt.classroomKey, attempt.classroom])).entries()), [attempts]);
  const latestAttempt = studentAttempts[studentAttempts.length - 1];
  const wrongQuestions = useMemo(() => latestAttempt?.answers ? attemptQuestions.filter((q) => latestAttempt.answers[q.numero] && latestAttempt.answers[q.numero] !== q.correta) : [], [attemptQuestions, latestAttempt]);
  const performanceMessage = totalAnswered === 0
    ? "Registre suas respostas para iniciar a leitura do desempenho."
    : overallPercentage >= 70 ? "Bom domÃ­nio do conjunto. Observe as Ã¡reas com menor percentual para orientar a revisÃ£o."
      : overallPercentage >= 45 ? "HÃ¡ uma base de aprendizagem consistente; use os detalhes por Ã¡rea para organizar a prÃ³xima revisÃ£o."
        : "O resultado mostra pontos concretos para retomar. Priorize uma Ã¡rea por vez e compare as respostas comentadas.";

  const setAnswer = (numero: number, answer: string) => {
    if (submitted || maxAttemptsReached) return;
    setAnswers((current) => ({ ...current, [numero]: answer }));
    setSubmitted(false);
  };
  const reveal = (numero: number) => setRevealed((current) => new Set(current).add(numero));
  const resetTimer = () => {
    if (submitted || maxAttemptsReached) return;
    setTimerRunning(false);
    setRemainingSeconds(timerPresets[timerPreset].seconds);
  };
  const chooseTimerPreset = (preset: TimerPreset) => {
    if (submitted || maxAttemptsReached) return;
    setTimerPreset(preset);
    setTimerRunning(false);
    setRemainingSeconds(timerPresets[preset].seconds);
  };
  const syncProgress = async (payload: { answers: Record<number, string>; remainingSeconds: number; studentName: string; classroom: string; attempts: Attempt[]; savedAt: string }) => {
    if (!isAuthenticated) return;
    setSyncState("syncing");
    try {
      await saveRemoteProgress(JSON.stringify(payload));
      setSyncState("cloud");
      setProgressNotice("Progresso salvo e sincronizado com sua conta.");
    } catch {
      setSyncState("error");
      setProgressNotice("Progresso salvo neste navegador; a sincronizaÃ§Ã£o serÃ¡ tentada no prÃ³ximo salvamento.");
    }
  };
  const finishSimulation = () => {
    if (submitted || maxAttemptsReached || totalAnswered === 0) return;
    const now = new Date().toISOString();
    const record: Attempt = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      studentKey,
      studentName: studentName.trim() || "Estudante local",
      classroomKey,
      classroom: classroom.trim() || "Turma local",
      createdAt: now,
      correct: totalCorrect,
      answered: totalAnswered,
      percentage: overallPercentage,
      remainingSeconds,
      byArea: areaPerformance.map((area) => ({ short: area.short, correct: area.correct, answered: area.answered, blank: area.blank, percentage: area.percentage })),
      answers: { ...answers },
      questionIds: Object.fromEntries(attemptQuestions.map((question) => [question.numero, question.id])),
    };
    const updated = [...attempts, record];
    setAttempts(updated);
    if (isAuthenticated) void syncProgress({ answers, remainingSeconds, studentName, classroom, attempts: updated, savedAt: new Date().toISOString() });
    window.localStorage.removeItem(PROGRESS_STORAGE_KEY);
    setSubmitted(true);
    setTimerRunning(false);
    scrollToSection("resultado");
  };
  const beginNextAttempt = () => {
    if (maxAttemptsReached) return;
    setAnswers({});
    setRevealed(new Set());
    setSubmitted(false);
    setTimerRunning(false);
    setRemainingSeconds(timerPresets[timerPreset].seconds);
    setActiveArea("Todas");
    setQuery("");
    setPage(1);
    scrollToSection("questoes");
  };
 const saveProgress = () => {
  const payload = { answers, remainingSeconds, studentName, classroom, attempts, savedAt: new Date().toISOString() };
   indow.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(payload));
    if (isAuthenticated) void syncProgress(payload);
    else setProgressNotice("Progresso salvo neste navegador. Entre na sua conta para sincronizÃ¡-lo entre dispositivos.");
  };
  const exportAllAttemptsCsv = () => {
    const header = ["Estudante", "Turma", "Data", "Acertos", "Respondidas", "Percentual", "Tempo restante", "Linguagens", "Humanas", "Natureza", "MatemÃ¡tica"];
    const rows = attempts.map((attempt) => {
      const byArea = new Map(attempt.byArea.map((area) => [area.short, area.percentage]));
      return [attempt.studentName, attempt.classroom, new Date(attempt.createdAt).toLocaleString("pt-BR"), attempt.correct, attempt.answered, `${attempt.percentage}%`, formatDuration(attempt.remainingSeconds), byArea.get("Linguagens") ?? "", byArea.get("Humanas") ?? "", byArea.get("Natureza") ?? "", byArea.get("MatemÃ¡tica") ?? ""];
    });
    const content = "\uFEFF" + [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const href = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = href; link.download = "resultados-simulado-todas-as-turmas.csv"; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(href);
  };
  const exportPdfReport = () => {
    const reportName = studentName.trim() || "Estudante";
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let y = 20;
    doc.setFillColor(29, 42, 68);
    doc.rect(0, 0, pageWidth, 34, "F");
    doc.setTextColor(255, 250, 242);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text("SIMULADO ENEM â€” RESULTADO INDIVIDUAL", 15, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text("RelatÃ³rio de desempenho gerado localmente", 15, 23);
    doc.setTextColor(29, 42, 68);
    y = 46;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(reportName, 15, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(91, 102, 117);
    doc.text(`Tentativa ${Math.max(1, attemptsUsed)} de ${MAX_DAILY_ATTEMPTS} Â· Gerado em ${new Date().toLocaleDateString("pt-BR")} Â· Tempo restante: ${formatDuration(remainingSeconds)}`, 15, y + 6);
    doc.setFillColor(244, 237, 227);
    doc.roundedRect(15, y + 15, pageWidth - 30, 28, 2, 2, "F");
    doc.setTextColor(29, 42, 68);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(24);
    doc.text(`${overallPercentage}%`, 22, y + 33);
    doc.setFontSize(9);
    doc.text("PERCENTUAL GLOBAL DE ACERTOS", 52, y + 27);
    doc.setFontSize(12);
    doc.text(`${totalCorrect} acertos em 100 itens`, 52, y + 34);
    y += 55;
    doc.setFontSize(12);
    doc.text("Desempenho detalhado por Ã¡rea", 15, y);
    y += 8;
    areaPerformance.forEach((area, index) => {
      const meta = getAreaMeta(area.area);
      const hex = meta.color.replace("#", "");
      doc.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
      doc.rect(15, y + index * 8, area.percentage * 1.4, 4, "F");
      doc.setTextColor(29, 42, 68); doc.setFontSize(7.5);
      doc.text(`${area.short} â€” ${area.percentage}%`, 158, y + 3 + index * 8, { align: "right" });
    });
    y += 38;
    areaPerformance.forEach((area) => {
      if (y > pageHeight - 32) { doc.addPage(); y = 20; }
      const meta = getAreaMeta(area.area);
      const hex = meta.color.replace("#", "");
      doc.setFillColor(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
      doc.rect(15, y - 4, 3, 18, "F");
      doc.setTextColor(29, 42, 68);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(area.short, 23, y + 1);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(91, 102, 117);
      doc.text(`${area.correct}/25 acertos Â· ${area.answered}/25 respondidas Â· ${area.blank} em branco`, 23, y + 7);
      doc.setTextColor(29, 42, 68);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text(`${area.percentage}%`, pageWidth - 29, y + 4, { align: "right" });
      y += 23;
    });
    if (y > pageHeight - 36) { doc.addPage(); y = 20; }
    doc.setDrawColor(200, 77, 58);
    doc.setLineWidth(.7);
    doc.line(15, y + 4, pageWidth - 15, y + 4);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(29, 42, 68);
    doc.text("Leitura pedagÃ³gica", 15, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.6);
    doc.setTextColor(91, 102, 117);
    const observation = doc.splitTextToSize(performanceMessage + " A pontuaÃ§Ã£o representa acertos simples neste simulado; nÃ£o equivale Ã  nota TRI do ENEM.", pageWidth - 30);
    doc.text(observation, 15, y + 19);
    doc.setFontSize(7.5);
    doc.setTextColor(120, 128, 138);
    doc.text("Simulado ENEM Interativo Â· Material autoral reformulado para prÃ¡tica pedagÃ³gica.", 15, pageHeight - 12);
    const safeName = reportName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "estudante";
    doc.save(`resultado-simulado-enem-${safeName}.pdf`);
  };
  const exportCadernoPdf = (cadernoQuestions: readonly Question[], selectionLabel: string) => {
    if (!cadernoQuestions.length) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let page = 1;
    let y = 35;
    const drawHeader = () => {
      doc.setFillColor(29, 42, 68);
      doc.rect(0, 0, pageWidth, 25, "F");
      doc.setTextColor(255, 250, 242);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.text("SIMULADO ENEM â€” CADERNO DE QUESTÃ•ES", 15, 12);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text("Material autoral reformulado para aplicaÃ§Ã£o pedagÃ³gica", 15, 18);
      doc.text(`${selectionLabel} Â· Folha ${String(page).padStart(2, "0")}`, pageWidth - 15, 18, { align: "right" });
      doc.setTextColor(29, 42, 68);
    };
    const drawFooter = (pageNumber: number) => {
      doc.setDrawColor(207, 199, 184);
      doc.line(15, pageHeight - 12, pageWidth - 15, pageHeight - 12);
      doc.setTextColor(112, 126, 142);
      doc.setFontSize(7);
      doc.text("Simulado ENEM Interativo", 15, pageHeight - 7);
      doc.text(`${pageNumber}`, pageWidth - 15, pageHeight - 7, { align: "right" });
    };
    const nextPage = () => { doc.addPage(); page += 1; y = 35; drawHeader(); };

    drawHeader();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(["Escola: ______________________________________________", "Professor(a): ________________________________________", "Estudante: __________________________________________", "Turma: ____________________    Data: ____ / ____ / ______"], 15, y, { lineHeightFactor: 1.55 });
    y += 27;
    cadernoQuestions.forEach((question) => {
      const questionLines = doc.splitTextToSize(question.enunciado, pageWidth - 30) as string[];
      const alternativeLines = (["A", "B", "C", "D"] as const).flatMap((letter) => doc.splitTextToSize(`${letter}. ${question.alternativas[letter]}`, pageWidth - 38) as string[]);
      const requiredHeight = 12 + questionLines.length * 4.4 + alternativeLines.length * 3.8;
      if (y + requiredHeight > pageHeight - 20) nextPage();
      doc.setTextColor(200, 77, 58);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(`QuestÃ£o ${String(question.numero).padStart(2, "0")}`, 15, y);
      doc.setTextColor(101, 112, 128);
      doc.setFontSize(7.5);
      doc.text(question.areaCurta, pageWidth - 15, y, { align: "right" });
      y += 5;
      doc.setTextColor(29, 42, 68);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(questionLines, 15, y, { lineHeightFactor: 1.35 });
      y += questionLines.length * 4.4 + 2.2;
      doc.setFontSize(8.6);
      (["A", "B", "C", "D"] as const).forEach((letter) => {
        const lines = doc.splitTextToSize(`${letter}. ${question.alternativas[letter]}`, pageWidth - 38) as string[];
        doc.text(lines, 20, y, { lineHeightFactor: 1.25 });
        y += lines.length * 3.8 + 1;
      });
      doc.setDrawColor(222, 214, 203);
      doc.line(15, y + 1, pageWidth - 15, y + 1);
      y += 6;
    });
    const pages = doc.getNumberOfPages();
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) { doc.setPage(pageNumber); drawFooter(pageNumber); }
    doc.save(cadernoPdfFilename());
  };
  const toggleCadernoBlock = (blockId: string) => setSelectedCadernoBlocks((current) => current.includes(blockId) ? current.filter((id) => id !== blockId) : [...current, blockId]);
  const requestCadernoOutput = (outputMode: CadernoOutputMode) => {
    setCadernoOutputMode(outputMode);
    setPrintDialogOpen(true);
  };
  const confirmCadernoOutput = () => {
    if (!selectedCadernoQuestions.length) return;
    if (cadernoOutputMode === "pdf") exportCadernoPdf(selectedCadernoQuestions, selectedCadernoLabel);
    else printPreview(selectedCadernoQuestions, selectedCadernoLabel);
    setPrintDialogOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F7F3EC] text-[#1D2A44]">
      <header className="topbar">
        <a href="#inicio" className="brand" aria-label="Ir para o inÃ­cio">
          <img src="/simulado-enem-logo.svg" alt="SÃ­mbolo do Simulado ENEM" className="brand-mark" />
          <span className="brand-word"><strong>SIMULADO</strong><em>ENEM</em></span>
        </a>
        <nav className={`main-nav ${menuOpen ? "open" : ""}`} aria-label="NavegaÃ§Ã£o principal">
          <button onClick={() => { scrollToSection("matriz"); setMenuOpen(false); }}>Matriz</button>
          <button onClick={() => { scrollToSection("questoes"); setMenuOpen(false); }}>QuestÃµes</button>
          <button onClick={() => { scrollToSection("resultado"); setMenuOpen(false); }}>Resultado</button>
          {maxAttemptsReached && <button onClick={() => { scrollToSection("acompanhamento"); setMenuOpen(false); }}>Acompanhamento</button>}
          {teacherMode && <button onClick={() => { scrollToSection("correcao"); setMenuOpen(false); }}>CorreÃ§Ã£o</button>}
          <button onClick={() => { scrollToSection("fontes"); setMenuOpen(false); }}>Fontes</button>
        </nav>
        <div className="top-actions">
          {!loading && (isAuthenticated ? <><span className={`top-timer ${syncState}`}>{syncState === "cloud" ? "âœ“ Sincronizado" : syncState === "syncing" ? "â†» Sincronizando" : syncState === "error" ? "! Salvo localmente" : "â€¢ Sem salvar"}</span><button className="top-timer" onClick={() => void logout()}>Sair da conta</button></> : <button className="top-timer" onClick={() => openAuth("login")}>Acesso aluno</button>)}
          <button className={`top-timer ${isCriticalTime ? "critical" : ""}`} onClick={() => scrollToSection("questoes")} aria-label="Ir para o cronÃ´metro"><Timer size={15} /><span>{formatDuration(remainingSeconds)}</span></button>
          {teacherMode && <Button className="print-button" onClick={() => requestCadernoOutput("print")}><Printer size={16} /> Imprimir caderno</Button>}
          <button className="menu-button" aria-label="Abrir menu" onClick={() => setMenuOpen((value) => !value)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
        </div>
      </header>

      <StudentAuthDialog open={authOpen} onOpenChange={setAuthOpen} initialMode={authInitialMode} context={authContext} onLogin={loginFromDialog} onSignup={signup} onRecover={recover} requiresPasswordReset={requiresPasswordReset} onCompletePasswordRecovery={completePasswordRecovery} />
      <AlertDialog open={printDialogOpen} onOpenChange={setPrintDialogOpen}>
        <AlertDialogContent className="max-h-[90vh] overflow-y-auto border-[#D8D0C3] bg-[#FDFBF6] text-[#1D2A44] sm:max-w-3xl">
          <AlertDialogHeader><AlertDialogTitle className="font-serif text-2xl">Preparar caderno docente</AlertDialogTitle><AlertDialogDescription className="text-[#5B697A]">Escolha os blocos e revise a paginaÃ§Ã£o A4 antes de {cadernoOutputMode === "pdf" ? "gerar o PDF" : "abrir a impressÃ£o"}.</AlertDialogDescription></AlertDialogHeader>
          <section className="mt-1 border-y border-[#DED6C8] py-4" aria-labelledby="blocos-caderno"><div className="mb-3 flex items-end justify-between gap-4"><div><h3 id="blocos-caderno" className="text-sm font-extrabold text-[#1D2A44]">Blocos de aplicaÃ§Ã£o</h3><p className="mt-1 text-xs text-[#657083]">Cada bloco reÃºne 50 questÃµes. VocÃª pode combinar os dois ou aplicar apenas um dia.</p></div><span className="shrink-0 text-xs font-bold text-[#C84D3A]">{selectedCadernoQuestions.length} itens</span></div><div className="grid gap-2 sm:grid-cols-2">{CADERNO_PRINT_BLOCKS.map((block) => { const selected = selectedCadernoBlocks.includes(block.id); return <label key={block.id} className={`cursor-pointer border p-3 transition-colors ${selected ? "border-[#1D2A44] bg-[#EEF2F4]" : "border-[#D8D0C3] bg-white"}`}><input type="checkbox" className="sr-only" checked={selected} onChange={() => toggleCadernoBlock(block.id)} /><span className="flex items-start gap-2"><span className={`mt-0.5 grid h-4 w-4 place-items-center border text-[10px] ${selected ? "border-[#1D2A44] bg-[#1D2A44] text-white" : "border-[#AEB7BD] bg-white text-transparent"}`}><Check size={11} /></span><span><strong className="block text-xs text-[#1D2A44]">{block.label}</strong><span className="mt-1 block text-[11px] leading-snug text-[#657083]">{block.description}</span></span></span></label>; })}</div></section>
          <section className="mt-4" aria-labelledby="previa-caderno"><div className="flex items-end justify-between gap-4"><div><h3 id="previa-caderno" className="text-sm font-extrabold text-[#1D2A44]">PrÃ©-visualizaÃ§Ã£o da impressÃ£o</h3><p className="mt-1 text-xs text-[#657083]">A paginaÃ§Ã£o usa atÃ© quatro questÃµes por folha, com cabeÃ§alho, rodapÃ© e identificaÃ§Ã£o.</p></div><span className="shrink-0 text-xs font-bold text-[#497464]">{selectedCadernoPages.length} {selectedCadernoPages.length === 1 ? "folha" : "folhas"}</span></div>{selectedCadernoPages.length ? <div className="mt-3 grid max-h-48 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3">{selectedCadernoPages.map((previewPage, index) => <article className="min-h-28 border border-[#D8D0C3] bg-white p-3 shadow-[3px_3px_0_#E7E0D5]" key={`${previewPage[0]?.numero}-${index}`}><div className="flex justify-between border-b border-[#E4DCD0] pb-1 text-[9px] font-extrabold uppercase tracking-wider text-[#697483]"><span>Folha {String(index + 1).padStart(2, "0")}</span><span>{previewPage.length} itens</span></div><ol className="mt-2 grid gap-1 text-[10px] leading-snug text-[#3F5066]">{previewPage.map((question) => <li key={question.numero}><strong className="text-[#C84D3A]">{String(question.numero).padStart(2, "0")}</strong> Â· {question.areaCurta}</li>)}</ol></article>)}</div> : <p className="mt-3 border border-dashed border-[#C84D3A] bg-[#FCE8E3] p-3 text-xs text-[#8B3529]">Selecione pelo menos um bloco para continuar.</p>}</section>
          <AlertDialogFooter className="mt-5"><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction disabled={!selectedCadernoQuestions.length} className="bg-[#1D2A44] text-white hover:bg-[#2B4164] disabled:cursor-not-allowed disabled:opacity-50" onClick={confirmCadernoOutput}>{cadernoOutputMode === "pdf" ? <><FileDown size={15} /> Gerar PDF</> : <><Printer size={15} /> Abrir impressÃ£o</>}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <main id="inicio">
        <section className="hero-section">
          <div className="hero-content">
            <div className="eyebrow"><span></span> Caderno autoral reformulado Â· 100 itens</div>
            <h1>RevisÃ£o que vira <i>diagnÃ³stico.</i></h1>
            <p>Um caderno de simulado para aplicar, interpretar e corrigir: **25 questÃµes por Ã¡rea**, quatro alternativas e uma estrutura pronta para a sala de aula.</p>
            <div className="hero-actions">
              <Button onClick={() => scrollToSection("questoes")} className="hero-primary">Iniciar simulado <ArrowRight size={17} /></Button>
              {teacherMode && <button className="hero-secondary" onClick={() => downloadFile("mascara", attemptPrintQuestions)}><ArrowDownToLine size={17} /> Baixar mÃ¡scara</button>}
            </div>
            <div className="hero-note"><Info size={15} /> Itens autorais inspirados em habilidades e temas de provas oficiais; nÃ£o sÃ£o reproduÃ§Ãµes literais.</div>
          </div>
          <div className="hero-image-wrap" aria-hidden="true">
            <img src="/simulado-enem-hero.svg" alt="" className="hero-image" />
            <div className="hero-stamp"><strong>4</strong><span>alternativas<br />por item</span></div>
          </div>
        </section>

        <section className="rail-layout" id="matriz">
          <aside className="section-rail">
            <span className="rail-index">01</span>
            <span className="rail-line"></span>
            <p>Mapa<br />do caderno</p>
          </aside>
          <div className="section-body matrix-layout">
            <div className="section-intro">
              <div><span className="eyebrow"><span></span> Matriz de composiÃ§Ã£o</span><h2>Quatro Ã¡reas.<br /><i>Uma leitura equilibrada.</i></h2></div>
              <p>O ENEM reÃºne quatro Ã¡reas com 45 itens cada. Neste recorte de 100 questÃµes, a divisÃ£o proporcional resulta em 25 itens por Ã¡rea.[<a href="#fontes">1</a>]</p>
            </div>
            <div className="stat-strip">
              <div><strong>100</strong><span>questÃµes</span></div>
              <div><strong>25</strong><span>por Ã¡rea</span></div>
              <div><strong>4</strong><span>alternativas</span></div>
              <div><strong>2</strong><span>blocos de aplicaÃ§Ã£o</span></div>
            </div>
            <div className="chart-card bar-card">
              <div className="card-heading"><div><span className="mini-label">DISTRIBUIÃ‡ÃƒO</span><h3>Itens por Ã¡rea de conhecimento</h3></div><BarChart3 size={19} /></div>
              <div className="chart-visual">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={areaSummary} layout="vertical" margin={{ top: 6, right: 24, left: 2, bottom: 2 }}>
                    <XAxis type="number" domain={[0, 28]} hide />
                    <YAxis dataKey="short" type="category" width={92} tick={{ fill: "#435064", fontSize: 12, fontFamily: "Manrope" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "#EAE3D6" }} contentStyle={{ borderRadius: 0, border: "1px solid #D9D0C1", boxShadow: "none", fontFamily: "Manrope", fontSize: 12 }} formatter={(value) => [`${value} questÃµes`, "Quantidade"]} />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={20}>{areaSummary.map((entry, index) => <Cell key={entry.short} fill={chartColors[index]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="chart-caption">Passe o cursor pelas barras para consultar a distribuiÃ§Ã£o proporcional.</p>
            </div>
            <div className="chart-card pie-card">
              <div className="card-heading"><div><span className="mini-label">OPERAÃ‡Ã•ES PRIORIZADAS</span><h3>Como o caderno mobiliza competÃªncias</h3></div></div>
              <div className="pie-with-legend">
                <div className="pie-visual"><ResponsiveContainer width="100%" height="100%"><PieChart><Tooltip contentStyle={{ borderRadius: 0, border: "1px solid #D9D0C1", boxShadow: "none", fontFamily: "Manrope", fontSize: 12 }} formatter={(value) => [`${value} itens`, ""]} /><Pie data={operationData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={3} stroke="none">{operationData.map((entry, index) => <Cell key={entry.name} fill={chartColors[index]} />)}</Pie></PieChart></ResponsiveContainer></div>
                <div className="legend-list">{operationData.map((entry, index) => <div key={entry.name}><span style={{ background: chartColors[index] }}></span><p>{entry.name}<strong>{entry.value}%</strong></p></div>)}</div>
              </div>
              <p className="chart-caption">ClassificaÃ§Ã£o editorial dos itens do prÃ³prio simulado, para apoiar a revisÃ£o por operaÃ§Ã£o cognitiva.</p>
            </div>
          </div>
        </section>

        <section className="area-section">
          <div className="area-heading"><span className="eyebrow"><span></span> Percurso de estudo</span><h2>Selecione uma Ã¡rea e encontre<br /><i>o tipo de desafio.</i></h2></div>
          <div className="area-cards">
            {areaSummary.map((entry) => {
              const longName = entry.area as AreaName;
              const meta = areaMeta[longName];
              return <button key={entry.area} className="area-card" style={{ "--area-color": meta.color, "--area-pale": meta.pale } as React.CSSProperties} onClick={() => { setActiveArea(longName); scrollToSection("questoes"); }}>
                <div><span className="area-index">{meta.index}</span><span className="area-count">{entry.count} itens</span></div>
                <h3>{entry.short}</h3><p>{longName.replace(" e suas Tecnologias", "")}</p><span className="area-arrow"><ArrowRight size={17} /></span>
              </button>;
            })}
          </div>
        </section>

        <section className="method-section">
          <div className="method-image"><img src="/manus-storage/enem-skills-collage_6f192fac.jpg" alt="Colagem abstrata que representa quatro campos do conhecimento" /></div>
          <div className="method-copy">
            <span className="eyebrow"><span></span> Como foi elaborado</span>
            <h2>Uma compilaÃ§Ã£o para <i>ensinar</i>, nÃ£o para copiar.</h2>
            <p>Os itens foram escritos do zero, a partir da Matriz de ReferÃªncia e da observaÃ§Ã£o de contextos, habilidades e formatos recorrentes nos cadernos oficiais. A opÃ§Ã£o por quatro alternativas Ã© uma adaptaÃ§Ã£o solicitada para este simulado.</p>
            <div className="method-points"><p><Check size={16} /> 1.500 itens autorais e contextualizados</p><p><Check size={16} /> Habilidade, tema e justificativa por questÃ£o</p><p><Check size={16} /> Caderno, gabarito e mÃ¡scara em separado</p></div>
            <button className="text-button" onClick={() => scrollToSection("fontes")}>Ver referÃªncias oficiais <ArrowRight size={16} /></button>
          </div>
        </section>

        <section className="rail-layout question-section" id="questoes">
          <aside className="section-rail"><span className="rail-index">02</span><span className="rail-line"></span><p>Banco<br />de questÃµes</p></aside>
          <div className="section-body">
            <div className="question-header">
              <div><span className="eyebrow"><span></span> Leitura ativa</span><h2>Banco de questÃµes<br /><i>para explorar.</i></h2></div>
              <span className="workbook-note">folha de aplicaÃ§Ã£o<br />marque uma opÃ§Ã£o</span>
              <div className="question-actions"><Button variant="outline" className="download-outline" onClick={() => accessUnlocked && downloadFile("caderno", attemptPrintQuestions)}><ArrowDownToLine size={16} /> Baixar caderno</Button>{teacherMode && <Button className="print-button" onClick={() => requestCadernoOutput("print")}><Printer size={16} /> Imprimir</Button>}</div>
            </div>
            <section className="student-dashboard" id="resultado" aria-label="Painel de desempenho do estudante">
              <span className="workbook-folio">FOLHA 01 Â· APLICAÃ‡ÃƒO E ACOMPANHAMENTO</span>
              {accessUnlocked ? <>
              <div className="student-dashboard-top">
                <div><span className="eyebrow"><span></span> Modo de realizaÃ§Ã£o</span><h3>Seu percurso, em tempo real.</h3><p>{isAuthenticated ? "Suas respostas e tentativas podem ser sincronizadas com esta conta. A pontuaÃ§Ã£o Ã© por acerto simples e nÃ£o corresponde Ã  nota TRI." : "As respostas e tentativas ficam neste navegador atÃ© vocÃª entrar em uma conta. A pontuaÃ§Ã£o Ã© por acerto simples e nÃ£o corresponde Ã  nota TRI."}</p></div>
                <div className="student-profile"><label className="student-name"><UserRound size={16} /><span>Nome no relatÃ³rio</span><input value={studentName} disabled={submitted || maxAttemptsReached} onChange={(event) => setStudentName(event.target.value)} placeholder="Como quer ser identificado?" /></label><label className="student-name classroom-name"><GraduationCap size={16} /><span>Turma local</span><input value={classroom} disabled={submitted || maxAttemptsReached} onChange={(event) => setClassroom(event.target.value)} placeholder="Ex.: 3.Âº ano A" /></label></div>
              </div>
              <div className={`attempt-limit ${maxAttemptsReached ? "limit-reached" : ""}`}><div><span className="attempt-kicker">LIMITE DIÃRIO DE REALIZAÃ‡ÃƒO</span><strong>{attemptsUsed} de {MAX_DAILY_ATTEMPTS} tentativas concluÃ­das hoje</strong><p>{maxAttemptsReached ? "As trÃªs tentativas de hoje foram concluÃ­das. AmanhÃ£, vocÃª terÃ¡ trÃªs novas tentativas disponÃ­veis; seu histÃ³rico permanece salvo." : `VocÃª ainda pode concluir ${attemptsRemaining} ${attemptsRemaining === 1 ? "tentativa" : "tentativas"} hoje.`}</p></div><div className="attempt-dots" aria-label={`${attemptsUsed} de ${MAX_DAILY_ATTEMPTS} tentativas utilizadas hoje`}>{Array.from({ length: MAX_DAILY_ATTEMPTS }, (_, index) => <span className={index < attemptsUsed ? "used" : ""} key={index}>{index + 1}</span>)}</div></div>
              <div className={`exam-timer ${isCriticalTime ? "critical" : ""} ${isTimeOver ? "finished" : ""}`}>
                <div className="timer-copy"><div><Timer size={19} /><span>CRONÃ”METRO DE SIMULAÃ‡ÃƒO</span></div><p>{isTimeOver ? "Tempo encerrado" : isCriticalTime ? "AtenÃ§Ã£o: Ãºltimos 10 minutos" : "Escolha o dia e inicie quando estiver pronto."}</p></div>
                <div className="timer-display" aria-live="polite">{formatDuration(remainingSeconds)}</div>
                <div className="timer-controls"><select value={timerPreset} disabled={submitted || maxAttemptsReached} onChange={(event) => chooseTimerPreset(event.target.value as TimerPreset)} aria-label="Selecionar duraÃ§Ã£o da prova"><option value="dia1">1.Âº dia Â· 5h30</option><option value="dia2">2.Âº dia Â· 5h</option></select><button onClick={() => setTimerRunning((value) => !value)} disabled={isTimeOver || submitted || maxAttemptsReached} className="timer-start">{timerRunning ? <Pause size={15} /> : <Play size={15} />}{timerRunning ? "Pausar" : "Iniciar"}</button><button onClick={resetTimer} disabled={submitted || maxAttemptsReached} className="timer-reset" aria-label="Reiniciar cronÃ´metro"><RotateCcw size={15} /></button></div>
              </div>
              <div className="live-score">
                <div className="score-orbit" style={{ "--score": `${overallPercentage * 3.6}deg` } as React.CSSProperties}><div><strong>{overallPercentage}%</strong><span>acertos</span></div></div>
                <div className="score-copy"><span className="mini-label">DESEMPENHO GLOBAL Â· TENTATIVA {currentAttemptNumber} DE {MAX_DAILY_ATTEMPTS} HOJE</span><h3>{totalCorrect} de 100 itens corretos</h3><p>{totalAnswered} respostas registradas Â· {100 - totalAnswered} itens em branco</p><p className="score-message">{maxAttemptsReached ? "Ciclo diÃ¡rio de trÃªs tentativas concluÃ­do. Consulte o histÃ³rico abaixo; amanhÃ£ haverÃ¡ novas tentativas." : performanceMessage}</p></div>
                <div className="score-actions"><Button className="score-finalize" onClick={finishSimulation} disabled={submitted || maxAttemptsReached || totalAnswered === 0}><Trophy size={16} /> {maxAttemptsReached ? "Ciclo concluÃ­do" : submitted ? "Resultado registrado" : "Finalizar e corrigir"}</Button><Button variant="outline" className="pdf-button" onClick={saveProgress} disabled={submitted || maxAttemptsReached}><FileDown size={16} /> Salvar progresso</Button><Button variant="outline" className="pdf-button" onClick={exportPdfReport} disabled={!submitted}><FileDown size={16} /> Exportar PDF</Button></div>
              </div>
              {progressNotice && <p className="text-xs px-8 pb-3 text-[#497464] font-bold">{progressNotice}</p>}
              <div className="area-performance-grid">
                {areaPerformance.map((area) => { const meta = areaMeta[area.area as AreaName]; return <div className="area-performance" key={area.area}><div><span style={{ background: meta.color }}></span><p>{area.short}<small>{area.correct}/25 acertos</small></p><strong>{area.percentage}%</strong></div><div className="performance-track"><i style={{ width: `${area.percentage}%`, background: meta.color }}></i></div><small>{area.answered} respondidas Â· {area.blank} em branco</small></div>; })}
              </div>
              {submitted && <div className="result-ready"><Check size={17} /><p><strong>Resultado registrado.</strong> Consulte as respostas comentadas, analise os percentuais por Ã¡rea e exporte seu relatÃ³rio personalizado.</p>{!maxAttemptsReached && <button onClick={beginNextAttempt}>Iniciar tentativa {attemptsUsed + 1} de {MAX_DAILY_ATTEMPTS} hoje <ArrowRight size={14} /></button>}</div>}
              {maxAttemptsReached && <section className="attempts-complete" id="acompanhamento"><div className="attempts-complete-heading"><div><span className="eyebrow"><span></span> Ciclo diÃ¡rio concluÃ­do</span><h3>TrÃªs tentativas de hoje, agora em <i>perspectiva.</i></h3><p>{isAuthenticated ? "Seu histÃ³rico permanece associado a esta conta e novas trÃªs tentativas serÃ£o liberadas amanhÃ£." : "Entre em uma conta para manter o histÃ³rico disponÃ­vel em outro dispositivo; amanhÃ£ haverÃ¡ trÃªs novas tentativas."}</p></div><div className="complete-lock"><LockKeyhole size={20} /><span>3 / 3</span></div></div><div className="local-insights"><article className="attempt-history"><div className="insight-title"><History size={18} /><div><span>HISTÃ“RICO DO ESTUDANTE</span><strong>{studentName.trim() || "Estudante local"}</strong></div></div>{studentAttempts.map((attempt, index) => <div className="attempt-row" key={attempt.id}><span>{String(index + 1).padStart(2, "0")}</span><p>{new Date(attempt.createdAt).toLocaleDateString("pt-BR")}<small>{attempt.correct}/100 acertos Â· {attempt.answered} respondidas</small></p><strong>{attempt.percentage}%</strong></div>)}</article><article className="teacher-panel"><div className="insight-title"><UsersRound size={18} /><div><span>PAINEL DOCENTE LOCAL</span><strong>{classroom.trim() || "Turma local"}</strong></div></div><div className="teacher-metrics"><div><strong>{uniqueStudentsInClass}</strong><span>estudantes</span></div><div><strong>{classAttempts.length}</strong><span>tentativas</span></div><div><strong>{classAverage}%</strong><span>mÃ©dia local</span></div></div><p>Os indicadores agregam registros disponÃ­veis neste dispositivo para a turma atual.</p><button className="csv-export" onClick={exportAllAttemptsCsv}><FileDown size={14} /> Exportar CSV de todas as turmas</button></article><article className="anonymous-ranking"><div className="insight-title"><Medal size={18} /><div><span>RANKING ANÃ”NIMO LOCAL</span><strong>Melhor resultado por participante</strong></div></div><div className="ranking-list">{anonymousRanking.map((entry, index) => <div key={entry.label}><span>{index + 1}</span><p>{entry.label}<small>{entry.attempts} {entry.attempts === 1 ? "tentativa" : "tentativas"}</small></p><strong>{entry.best}%</strong></div>)}</div></article></div><section className="review-panel"><div className="review-heading"><div><span className="eyebrow"><span></span> Modo de revisÃ£o</span><h4>Erros que viram <i>prÃ³ximo passo.</i></h4><p>ApÃ³s a terceira tentativa de hoje, compare suas respostas incorretas da Ãºltima realizaÃ§Ã£o com o gabarito e a explicaÃ§Ã£o detalhada.</p></div><button onClick={() => setReviewOpen((value) => !value)}>{reviewOpen ? "Ocultar revisÃ£o" : `Revisar ${wrongQuestions.length} erros`} <ArrowRight size={14} /></button></div>{reviewOpen && <div className="review-list">{latestAttempt?.answers ? wrongQuestions.map((q) => <article className="review-item" key={q.numero}><p><strong>QuestÃ£o {String(q.numero).padStart(2, "0")}</strong> Â· {q.enunciado}</p><div><span>Sua resposta: <b>{latestAttempt.answers[q.numero]}</b></span><span>Correta: <b>{q.correta}</b></span></div><aside><Check size={15} /> <strong>ExplicaÃ§Ã£o:</strong> {q.justificativa}</aside></article>) : <p className="review-empty">As tentativas anteriores nÃ£o registraram as alternativas. A revisÃ£o estarÃ¡ disponÃ­vel nas prÃ³ximas tentativas concluÃ­das.</p>}</div>}</section></section>}
              </> : <StudentAccessGate
  onLogin={() => openAuth("login")}
/>}
            </section>
            {accessUnlocked && <>
            <div className="filter-panel">
              <div className="filter-icon"><Filter size={18} /></div>
              <div className="area-filters" aria-label="Filtro de Ã¡reas"><button className={activeArea === "Todas" ? "active" : ""} onClick={() => setActiveArea("Todas")}>Todas <span>{ATTEMPT_QUESTION_COUNT}</span></button>{attemptAreaSummary.map((entry) => <button key={entry.area} style={{ "--filter-color": getAreaMeta(entry.area).color, "--filter-pale": areaMeta[entry.area as AreaName].pale } as React.CSSProperties} className={activeArea === entry.area ? "active" : ""} onClick={() => setActiveArea(entry.area as AreaName)}>{entry.short} <span>{entry.count}</span></button>)}</div>
              <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar tema ou habilidade" /></label>
            </div>
            <div className="results-bar"><p><strong>{filteredQuestions.length}</strong> itens encontrados {activeArea !== "Todas" && <>em <strong>{areaMeta[activeArea].short}</strong></>}</p><span>PÃ¡gina {page} de {totalPages}</span></div>
            <div className="questions-stack">
              {currentQuestions.length ? currentQuestions.map((q) => <QuestionCard key={q.numero} q={q} selected={answers[q.numero]} onSelect={(answer) => setAnswer(q.numero, answer)} revealed={revealed.has(q.numero)} onReveal={() => reveal(q.numero)} canReveal={submitted && teacherMode} disabled={submitted || maxAttemptsReached} />) : <div className="empty-state"><Search size={25} /><h3>Nenhum item encontrado</h3><p>Tente outro termo de busca ou selecione todas as Ã¡reas.</p></div>}
            </div>
            {filteredQuestions.length > pageSize && <div className="pagination"><button disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} /> Anterior</button><div>{Array.from({ length: totalPages }, (_, index) => <button key={index} className={page === index + 1 ? "current" : ""} onClick={() => setPage(index + 1)}>{index + 1}</button>)}</div><button disabled={page === totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>PrÃ³xima <ChevronRight size={17} /></button></div>}
            </>}
          </div>
        </section>

        {teacherMode && <section className="correction-section" id="correcao">
          <div className="correction-copy"><span className="eyebrow light"><span></span> CorreÃ§Ã£o organizada</span><h2>Do cartÃ£o-resposta<br />Ã  <i>prÃ³xima aula.</i></h2><p>Escolha o bloco de aplicaÃ§Ã£o, revise a prÃ©-visualizaÃ§Ã£o e gere a versÃ£o A4 adequada para a turma.</p><div className="correction-buttons"><Button onClick={() => requestCadernoOutput("print")}><Printer size={16} /> Imprimir caderno</Button><Button variant="outline" className="light-outline" onClick={() => requestCadernoOutput("pdf")}><FileDown size={16} /> Exportar caderno PDF</Button><Button variant="outline" className="light-outline" onClick={() => downloadFile("mascara", attemptPrintQuestions)}><ArrowDownToLine size={16} /> Baixar mÃ¡scara</Button><Button variant="outline" className="light-outline" onClick={() => downloadFile("gabarito", attemptPrintQuestions)}><BookOpenCheck size={16} /> Baixar gabarito</Button></div></div>
          <div className="correction-card"><img src="/manus-storage/enem-correction-detail_08ac5859.jpg" alt="Detalhe de uma folha de respostas sendo corrigida" /><div className="correction-card-body"><div><ClipboardCheck size={21} /><span>CHAVE DOCENTE</span></div><h3>100 respostas<br />em uma Ãºnica matriz.</h3><button onClick={() => setShowKey((value) => !value)}>{showKey ? "Ocultar chave" : "Consultar chave"} <ArrowRight size={16} /></button></div></div>
          {showKey && <div className="answer-key" aria-live="polite"><div className="answer-key-title"><div><span className="mini-label">GABARITO RÃPIDO</span><h3>Chave de correÃ§Ã£o</h3></div><button onClick={() => setShowKey(false)} aria-label="Fechar chave"><X size={17} /></button></div><div className="answer-key-grid">{attemptPrintQuestions.map((q) => <div key={q.numero}><span>{String(q.numero).padStart(3, "0")}</span><strong>{q.correta}</strong></div>)}</div></div>}
          <div className="answer-key"><div className="answer-key-title"><div><span className="mini-label">PAINEL DOCENTE</span><h3>Resultados locais</h3></div><div><select value={teacherFilter} onChange={(event) => setTeacherFilter(event.target.value)}><option value="todas">Todas as turmas</option>{teacherClassrooms.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select><select value={teacherSort} onChange={(event) => setTeacherSort(event.target.value)}><option value="score">Maior pontuaÃ§Ã£o</option><option value="date">Mais recente</option></select></div></div><div className="answer-key-grid">{teacherRows.map((attempt) => <div key={attempt.id}><span>{attempt.studentName} Â· {attempt.classroom}</span><strong>{attempt.percentage}%</strong></div>)}</div></div>
        </section>}

        <section className="sources-section" id="fontes">
          <div className="sources-title"><span className="eyebrow"><span></span> TransparÃªncia editorial</span><h2>Fontes e<br /><i>delimitaÃ§Ã£o.</i></h2></div>
          <div className="sources-list">
            <a href="https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos" target="_blank" rel="noreferrer"><span>[1]</span><div><strong>Provas e Gabaritos do ENEM â€” Inep</strong><p>Estrutura das quatro provas objetivas e acesso aos cadernos oficiais desde 2009.</p></div><ArrowRight size={17} /></a>
            <a href="https://download.inep.gov.br/download/enem/matriz_referencia.pdf" target="_blank" rel="noreferrer"><span>[2]</span><div><strong>Matriz de ReferÃªncia do ENEM â€” Inep</strong><p>Eixos cognitivos, competÃªncias e habilidades que orientam a elaboraÃ§Ã£o dos itens.</p></div><ArrowRight size={17} /></a>
            <a href="https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2024" target="_blank" rel="noreferrer"><span>[3]</span><div><strong>Cadernos e gabaritos de 2024 â€” Inep</strong><p>ReferÃªncia recente de organizaÃ§Ã£o da aplicaÃ§Ã£o regular em primeiro e segundo dias.</p></div><ArrowRight size={17} /></a>
            <a href="https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2022" target="_blank" rel="noreferrer"><span>[4]</span><div><strong>Cadernos e gabaritos de 2022 â€” Inep</strong><p>ReferÃªncia histÃ³rica complementar para a continuidade da estrutura dos cadernos.</p></div><ArrowRight size={17} /></a>
          </div>
          <div className="disclaimer"><Info size={17} /><p><strong>Nota de uso.</strong> Este material nÃ£o Ã© uma prova oficial do Inep nem reproduz integralmente questÃµes de anos anteriores. Ã‰ um simulado autoral, com adaptaÃ§Ã£o de quatro alternativas, elaborado para prÃ¡tica pedagÃ³gica a partir de referÃªncias pÃºblicas.</p></div>
        </section>
      </main>

      <footer className="footer"><div className="footer-brand"><img src="/simulado-enem-logo.svg" alt="" /><span><strong>SIMULADO</strong><em>ENEM</em></span></div><p>Preparado para revisÃ£o, aplicaÃ§Ã£o e correÃ§Ã£o em contexto escolar.</p>{!teacherMode && <button className="teacher-developer-access" onClick={() => openAuth("login", "developer")}><LockKeyhole size={13} /> Acesso ao professor desenvolvedor</button>}<a href="#inicio">Voltar ao topo â†‘</a></footer>
    </div>
  );
}

