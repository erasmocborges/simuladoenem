import { getStore } from "@netlify/blobs";
import { getUser } from "@netlify/identity";
import { hasInstitutionalTeacherAccess } from "../../shared/identityRoles";

const jsonHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};

function response(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders,
  });
}

export default async function teacherProgress(request: Request) {
  if (request.method !== "GET") {
    return response({ error: "Método não permitido." }, 405);
  }

  const user = await getUser();

  if (!user) {
    return response(
      { error: "É necessário entrar na conta docente." },
      401,
    );
  }

  if (!hasInstitutionalTeacherAccess(user)) {
    return response(
      { error: "Acesso restrito ao professor autorizado." },
      403,
    );
  }

  const store = getStore("simulado-enem-progress");

  const result = await store.list({
    prefix: "students/",
  });

  const attempts = [];

  for (const blob of result.blobs) {
    const record = await store.get(blob.key, {
      type: "json",
      consistency: "strong",
    });

    if (!record || typeof record !== "object") continue;

    const payload =
      typeof (record as { payload?: unknown }).payload === "string"
        ? (record as { payload: string }).payload
        : null;

    if (!payload) continue;

    let parsed: unknown;

    try {
      parsed = JSON.parse(payload);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== "object") continue;

    const data = parsed as {
      attempts?: unknown;
      profile?: {
        studentName?: unknown;
        studentEmail?: unknown;
        classroom?: unknown;
      };
    };

    if (!Array.isArray(data.attempts)) continue;

    for (const attempt of data.attempts) {
      if (!attempt || typeof attempt !== "object") continue;

      const item = attempt as Record<string, unknown>;

      attempts.push({
        id: typeof item.id === "string" ? item.id : "",
        studentKey: blob.key.replace(/^students\//, "").replace(/\.json$/, ""),
        studentName:
          typeof item.studentName === "string"
            ? item.studentName
            : typeof data.profile?.studentName === "string"
              ? data.profile.studentName
              : "Estudante",
        studentEmail:
          typeof data.profile?.studentEmail === "string"
            ? data.profile.studentEmail
            : "",
        classroom:
          typeof item.classroom === "string"
            ? item.classroom
            : typeof data.profile?.classroom === "string"
              ? data.profile.classroom
              : "",
        createdAt:
          typeof item.createdAt === "string"
            ? item.createdAt
            : "",
        correct:
          typeof item.correct === "number"
            ? item.correct
            : 0,
        answered:
          typeof item.answered === "number"
            ? item.answered
            : 0,
        percentage:
          typeof item.percentage === "number"
            ? item.percentage
            : 0,
        remainingSeconds:
          typeof item.remainingSeconds === "number"
            ? item.remainingSeconds
            : 0,
        byArea: Array.isArray(item.byArea)
          ? item.byArea
          : [],
      });
    }
  }

  attempts.sort((a, b) => {
    return b.createdAt.localeCompare(a.createdAt);
  });

  return response({
    attempts,
    total: attempts.length,
  });
}
