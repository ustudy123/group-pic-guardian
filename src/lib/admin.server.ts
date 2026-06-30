import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: somente administradores.");
}

export async function createAuthUser(input: {
  email: string;
  password: string;
  isAdmin: boolean;
}) {
  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  });

  if (error) throw new Error(error.message);

  if (input.isAdmin && created.user) {
    const { error: roleErr } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: created.user.id, role: "admin" });

    if (roleErr && !roleErr.message.includes("duplicate")) {
      throw new Error(roleErr.message);
    }
  }

  return { id: created.user?.id, email: created.user?.email };
}

export async function removeAuthUser(userId: string) {
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) throw new Error(error.message);
}

export async function changeAuthUserPassword(userId: string, password: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    password,
  });
  if (error) throw new Error(error.message);
}

export async function setAdminRole(userId: string, isAdmin: boolean) {
  return setUserRole(userId, "admin", isAdmin);
}

export async function setUserRole(
  userId: string,
  role: "admin" | "user" | "vistoriante" | "analista",
  enabled: boolean,
) {
  if (enabled) {
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role });

    if (error && !error.message.includes("duplicate")) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId)
    .eq("role", role);

  if (error) throw new Error(error.message);
}

export async function confirmAuthUserEmail(userId: string) {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) throw new Error(error.message);
}