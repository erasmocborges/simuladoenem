export type IdentityRoleSource = {
  email?: string;
  role?: string;
  roles?: string[];
  appMetadata?: Record<string, unknown>;
};

export const STUDENT_ROLE = "student";
export const TEACHER_ROLE = "teacher";
export const AUTHORIZED_TEACHER_EMAIL = "erasmo.borges@escola.pr.gov.br";
export const INSTITUTIONAL_EMAIL_SUFFIX = "@escola.pr.gov.br";

export function isInstitutionalEmail(email: string) {
  return /^[^\s@]+@escola\.pr\.gov\.br$/i.test(email.trim());
}

export function hasTeacherRole(user: IdentityRoleSource | null | undefined) {
  if (!user) return false;
  if (user.role === TEACHER_ROLE) return true;
  if (user.roles?.includes(TEACHER_ROLE)) return true;
  const metadataRoles = user.appMetadata?.roles;
  return Array.isArray(metadataRoles) && metadataRoles.includes(TEACHER_ROLE);
}

export function hasInstitutionalTeacherAccess(user: IdentityRoleSource | null | undefined) {
  if (user?.email?.trim().toLocaleLowerCase("pt-BR") !== AUTHORIZED_TEACHER_EMAIL) return false;
  return hasTeacherRole(user);
}

export function rolesWithDefaultStudent(existing: unknown) {
  const roles = Array.isArray(existing) ? existing.filter((role): role is string => typeof role === "string") : [];
  return roles.includes(STUDENT_ROLE) ? roles : [...roles, STUDENT_ROLE];
}
