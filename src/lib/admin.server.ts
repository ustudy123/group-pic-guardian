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

/** Cria o login do encarregado e vincula em encarregados.user_id. */
export async function createLoginEncarregado(input: {
  encarregadoId: string;
  email: string;
  password: string;
}) {
  const { data: enc, error: encErr } = await supabaseAdmin
    .from("encarregados")
    .select("id, nome, user_id")
    .eq("id", input.encarregadoId)
    .single();
  if (encErr) throw new Error(encErr.message);
  if (enc.user_id) throw new Error("Este encarregado já tem um login vinculado.");

  const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { encarregado_id: input.encarregadoId, display_name: enc.nome },
  });
  if (error) throw new Error(error.message);

  const { error: linkErr } = await supabaseAdmin
    .from("encarregados")
    .update({ user_id: created.user!.id })
    .eq("id", input.encarregadoId);
  if (linkErr) {
    // desfaz o usuário órfão para poder tentar de novo
    await supabaseAdmin.auth.admin.deleteUser(created.user!.id).catch(() => {});
    throw new Error(linkErr.message);
  }

  return { userId: created.user!.id, email: created.user!.email };
}

/** E-mail do login vinculado a um encarregado (null se não tem). */
export async function getLoginEncarregado(encarregadoId: string) {
  const { data: enc, error } = await supabaseAdmin
    .from("encarregados")
    .select("user_id")
    .eq("id", encarregadoId)
    .single();
  if (error) throw new Error(error.message);
  if (!enc.user_id) return { userId: null as string | null, email: null as string | null };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", enc.user_id)
    .maybeSingle();
  return { userId: enc.user_id, email: prof?.email ?? null };
}