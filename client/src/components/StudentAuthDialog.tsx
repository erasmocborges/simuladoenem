import { useEffect, useState } from "react";
import { Loader2, MailCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authenticationErrorMessage, credentialValidationError, summarizeAuthError } from "@shared/authFeedback";
import { passwordRecoveryError } from "@shared/authRecovery";
import { AUTHORIZED_TEACHER_EMAIL } from "@shared/identityRoles";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AuthMode = "login" | "signup" | "recovery-request" | "reset-password";
type InitialAuthMode = "login" | "signup";
type AuthContext = "student" | "developer";

type StudentAuthDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: InitialAuthMode;
  context?: AuthContext;
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, name: string) => Promise<boolean>;
  onRecover: (email: string) => Promise<void>;
  requiresPasswordReset: boolean;
  onCompletePasswordRecovery: (password: string) => Promise<void>;
};

export function StudentAuthDialog({ open, onOpenChange, initialMode = "login", context = "student", onLogin, onSignup, onRecover, requiresPasswordReset, onCompletePasswordRecovery }: StudentAuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!requiresPasswordReset) return;
    setMode("reset-password");
    setError("");
    setNotice("Defina uma nova senha para concluir o acesso à sua conta.");
    onOpenChange(true);
  }, [onOpenChange, requiresPasswordReset]);

  useEffect(() => {
    if (!open || requiresPasswordReset) return;
    setMode(initialMode);
    setNotice("");
    setError("");
    setPassword("");
    setConfirmation("");
  }, [initialMode, open, requiresPasswordReset]);

  const changeMode = (next: AuthMode) => {
    setMode(next);
    setNotice("");
    setError("");
    setPassword("");
    setConfirmation("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setNotice("");
    setError("");
    if (mode === "reset-password") {
      const validationError = passwordRecoveryError(password, confirmation);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    if (mode === "login" || mode === "signup") {
      const validationError = credentialValidationError(email, password);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setPending(true);
    try {
      if (mode === "login") {
        await onLogin(email.trim(), password);
        onOpenChange(false);
      } else if (mode === "signup") {
        const authenticated = await onSignup(email.trim(), password, name.trim());
        setNotice(authenticated ? "Conta criada e conectada. Seu progresso poderá ser sincronizado." : "Conta criada. Use os dados cadastrados para entrar e sincronizar o simulado.");
        if (authenticated) onOpenChange(false);
      } else if (mode === "recovery-request") {
        await onRecover(email.trim());
        setNotice("Enviamos as instruções de redefinição de senha para seu e-mail.");
      } else {
        await onCompletePasswordRecovery(password);
        onOpenChange(false);
      }
    } catch (reason) {
      const summary = summarizeAuthError(reason);
      console.error("Falha do Netlify Identity", { status: summary.status, code: summary.code, message: summary.message });
      setError(authenticationErrorMessage(reason));
    } finally {
      setPending(false);
    }
  };

  const isDeveloperAccess = context === "developer";
  const title = mode === "login"
    ? isDeveloperAccess ? "Acesso do professor desenvolvedor" : "Entrar para sincronizar"
    : mode === "signup" ? "Criar conta de estudante" : mode === "recovery-request" ? "Recuperar acesso" : "Definir nova senha";
  const description = mode === "login"
    ? isDeveloperAccess
      ? `Use a conta docente autorizada. O acesso exige ${AUTHORIZED_TEACHER_EMAIL} e o papel teacher atribuído no Netlify Identity.`
      : "Use a conta criada nesta página — ela é independente do acesso administrativo ao Netlify."
    : mode === "signup"
      ? "Uma conta permite salvar respostas e histórico de tentativas com segurança."
      : mode === "recovery-request"
        ? "Informe o e-mail associado à sua conta para receber as instruções."
        : "Você chegou pelo link de recuperação. Crie uma nova senha para acessar e sincronizar o simulado.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-[#D9D0C1] bg-[#F7F3EC] p-7 text-[#1D2A44] sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-9 w-9 items-center justify-center border border-[#C84D3A] text-[#C84D3A]"><UserRound size={18} /></div>
          <DialogTitle className="font-serif text-2xl text-[#1D2A44]">{title}</DialogTitle>
          <DialogDescription className="leading-6 text-[#5B6675]">{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="mt-1 grid gap-4">
          {mode === "signup" && <label className="grid gap-1.5 text-xs font-bold tracking-[0.08em] text-[#435064] uppercase">Nome para o relatório<input value={name} onChange={(event) => setName(event.target.value)} required className="border border-[#D9D0C1] bg-white px-3 py-2.5 text-sm font-normal tracking-normal text-[#1D2A44] outline-none focus:border-[#C84D3A]" placeholder="Como quer ser identificado?" /></label>}
          {mode !== "reset-password" && <label className="grid gap-1.5 text-xs font-bold tracking-[0.08em] text-[#435064] uppercase">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" className="border border-[#D9D0C1] bg-white px-3 py-2.5 text-sm font-normal tracking-normal text-[#1D2A44] outline-none focus:border-[#C84D3A]" placeholder="voce@escola.com" /></label>}
          {mode !== "recovery-request" && <label className="grid gap-1.5 text-xs font-bold tracking-[0.08em] text-[#435064] uppercase">{mode === "reset-password" ? "Nova senha" : "Senha"}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} className="border border-[#D9D0C1] bg-white px-3 py-2.5 text-sm font-normal tracking-normal text-[#1D2A44] outline-none focus:border-[#C84D3A]" placeholder="Ao menos 8 caracteres" /></label>}
          {mode === "reset-password" && <label className="grid gap-1.5 text-xs font-bold tracking-[0.08em] text-[#435064] uppercase">Confirmar nova senha<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required minLength={8} autoComplete="new-password" className="border border-[#D9D0C1] bg-white px-3 py-2.5 text-sm font-normal tracking-normal text-[#1D2A44] outline-none focus:border-[#C84D3A]" placeholder="Repita a nova senha" /></label>}
          {error && <p role="alert" className="border-l-2 border-[#C84D3A] pl-3 text-sm text-[#A23C2D]">{error}</p>}
          {notice && <p role="status" className="flex gap-2 border-l-2 border-[#497464] pl-3 text-sm text-[#2C5B4A]"><MailCheck size={17} className="mt-0.5 shrink-0" />{notice}</p>}
          <Button type="submit" disabled={pending} className="bg-[#1D2A44] text-white hover:bg-[#283a5a]">{pending ? <><Loader2 size={16} className="animate-spin" /> Processando</> : mode === "login" ? "Entrar e sincronizar" : mode === "signup" ? "Criar conta" : mode === "recovery-request" ? "Enviar instruções" : "Salvar nova senha"}</Button>
        </form>
        {mode !== "reset-password" && <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[#DED6CA] pt-4 text-xs font-bold text-[#435064]">
          {mode !== "login" && <button type="button" onClick={() => changeMode("login")} className="underline decoration-[#C84D3A] underline-offset-4">Já tenho conta</button>}
          {mode !== "signup" && !isDeveloperAccess && <button type="button" onClick={() => changeMode("signup")} className="underline decoration-[#C84D3A] underline-offset-4">Criar conta</button>}
          {mode !== "recovery-request" && <button type="button" onClick={() => changeMode("recovery-request")} className="underline decoration-[#C84D3A] underline-offset-4">Esqueci a senha</button>}
        </div>}
      </DialogContent>
    </Dialog>
  );
}
