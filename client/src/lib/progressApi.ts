type ProgressResponse = {
  payload: string | null;
  savedAt?: string;
};

export type TeacherProgressAttempt = {
  id: string;
  studentKey: string;
  studentName: string;
  studentEmail: string;
  classroom: string;
  createdAt: string;
  correct: number;
  answered: number;
  percentage: number;
  remainingSeconds: number;
  byArea: Array<{
    short: string;
    correct: number;
    answered: number;
    blank: number;
    percentage: number;
  }>;
};

type TeacherProgressResponse = {
  attempts: TeacherProgressAttempt[];
  total: number;
};

async function readResponse(response: Response): Promise<ProgressResponse> {
  const data = (await response.json().catch(() => null)) as ProgressResponse | null;

  if (!response.ok || !data) {
    throw new Error("Não foi possível acessar o progresso sincronizado.");
  }

  return data;
}

async function readTeacherResponse(
  response: Response,
): Promise<TeacherProgressResponse> {
  const data = (await response.json().catch(() => null)) as
    | TeacherProgressResponse
    | { error?: string }
    | null;

  if (!response.ok || !data || !("attempts" in data)) {
    const message =
      data && "error" in data && typeof data.error === "string"
        ? data.error
        : "Não foi possível acessar os resultados dos estudantes.";

    throw new Error(message);
  }

  return data;
}

export async function loadRemoteProgress() {
  const response = await fetch("/api/progress", {
    credentials: "include",
  });

  return readResponse(response);
}

export async function saveRemoteProgress(payload: string) {
  const response = await fetch("/api/progress", {
    method: "PUT",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });

  return readResponse(response);
}

export async function loadTeacherProgress() {
  const response = await fetch("/api/teacher-progress", {
    credentials: "include",
  });

  return readTeacherResponse(response);
}
