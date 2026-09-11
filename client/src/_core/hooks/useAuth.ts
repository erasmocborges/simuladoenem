import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [requiresPasswordReset, setRequiresPasswordReset] = useState(false);

  const refresh = useCallback(async () => {
    const {
      data: { user: current },
    } = await supabase.auth.getUser();

    setUser(current);
    return current;
  }, []);

  useEffect(() => {
    let active = true;

    const loadSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (active) {
          setUser(session?.user ?? null);
        }
      } catch (reason) {
        if (active) {
          setError(reason);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      setUser(session?.user ?? null);

      if (event === "PASSWORD_RECOVERY") {
        setRequiresPasswordReset(true);
      }
    });

    void loadSession();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);

    const { data, error: signInError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (signInError) {
      throw signInError;
    }

    setUser(data.user);
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      setError(null);

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name || undefined,
          },
        },
      });

      if (signUpError) {
        throw signUpError;
      }

      setUser(data.user);

      return Boolean(data.session);
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    setError(null);

    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
      },
    });

    if (googleError) {
      throw googleError;
    }
  }, []);

  const recover = useCallback(async (email: string) => {
    setError(null);

    const { error: recoveryError } =
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });

    if (recoveryError) {
      throw recoveryError;
    }
  }, []);

  const completePasswordRecovery = useCallback(
    async (password: string) => {
      setError(null);

      const { data, error: updateError } =
        await supabase.auth.updateUser({
          password,
        });

      if (updateError) {
        throw updateError;
      }

      setUser(data.user);
      setRequiresPasswordReset(false);
    },
    [],
  );

  const logout = useCallback(async () => {
    setError(null);

    const { error: logoutError } = await supabase.auth.signOut();

    if (logoutError) {
      throw logoutError;
    }

    setUser(null);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    requiresPasswordReset,
    refresh,
    login: signIn,
    signup: signUp,
    signInWithGoogle,
    recover,
    completePasswordRecovery,
    logout,
  };
}
