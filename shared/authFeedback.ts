import { AUTHORIZED_TEACHER_EMAIL } from "./identityRoles";

type AuthErrorShape = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  message?: unknown;
  response?: { status?: unknown; data?: { msg?: unknown; message?: unknown } };
};

function readNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

export function summarizeAuthError(error: unknown) {
  const source = (error && typeof error === "object" ? error : {}) as AuthErrorShape;
  const status = readNumber(source.status) ?? readNumber(source.statusCode) ?? readNumber(source.response?.status);
  const code = typeof source.code === "string" ? source.code : undefined;
  const message = [source.message, source.response?.data?.msg, source.response?.data?.message]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? "";

  return { status, code, message };
}

export function authenticationErrorMessage(error: unknown) {
  const { status, message } = summarizeAuthError(error);
  const normalized = message.toLocaleLowerCase("pt-BR");

  if (/already (exists|registered)|already been registered|duplicate|taken/.test(normalized)) return "Já existe uma conta com este e-mail. Use “Já tenho conta” para entrar ou “Esqueci a senha” para criar uma senha nova.";
  if (/password.*(short|least|length|weak)|senha.*(curta|fraca)/.test(normalized)) return "A senha deve ter pelo menos 8 caracteres. Escolha uma senha nova e tente novamente.";
  if (/invalid.*email|email.*invalid/.test(normalized)) return "Confira o e-mail informado. Use o endereço institucional completo, sem espaços antes ou depois.";
  if (/not confirmed|confirmation|not verified/.test(normalized)) return "A conta ainda não está disponível para entrada. Aguarde alguns instantes e tente novamente.";
  if (status === 403 || /developer-role-required|teacher.*role|role.*teacher|permission|permissão|not authorized|não autorizado/.test(normalized)) return `A conta entrou, mas não tem autorização para o módulo do professor. Use “${AUTHORIZED_TEACHER_EMAIL}” e peça a atribuição do papel teacher no Netlify Identity.`;
  if (status === 429) return "Foram feitas muitas tentativas em sequência. Aguarde alguns minutos antes de tentar novamente.";
  if (status === 400 || status === 401 || status === 422) return "Não foi possível entrar com estes dados. Confira o e-mail e a senha; se a conta ainda não existe, selecione “Criar conta”.";
  if (status && status >= 500) return "O serviço de acesso está temporariamente indisponível. Aguarde alguns minutos e tente novamente.";
  return "Não foi possível concluir o acesso agora. Confira os dados e tente novamente.";
}

export function credentialValidationError(email: string, password: string) {
  if (!email.trim() || !email.includes("@")) return "Informe um e-mail válido para continuar.";
  if (password.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  return null;
}
