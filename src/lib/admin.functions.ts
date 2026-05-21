import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso negado: somente administradores.");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: usersData, error: usersErr } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersErr) throw new Error(usersErr.message);

    const { data: roles, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");
    if (rolesErr) throw new Error(rolesErr.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    return {
      users: usersData.users.map((u) => ({
        id: u.id,
        email: u.email ?? "",
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email_confirmed_at: u.email_confirmed_at ?? null,
        roles: rolesByUser.get(u.id) ?? [],
      })),
    };
  });

export const createUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(128),
        isAdmin: z.boolean().optional().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    if (data.isAdmin && created.user) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: created.user.id, role: "admin" });
      if (roleErr && !roleErr.message.includes("duplicate")) {
        throw new Error(roleErr.message);
      }
    }

    return { id: created.user?.id, email: created.user?.email };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        password: z.string().min(6).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { password: data.password },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        isAdmin: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    if (!data.isAdmin && data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio acesso de admin.");
    }

    if (data.isAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: data.userId, role: "admin" });
      if (error && !error.message.includes("duplicate")) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const confirmUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      { email_confirm: true },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [users, encs, fotos, grupos] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 }),
      supabaseAdmin.from("encarregados").select("id", { count: "exact", head: true }).eq("ativo", true),
      supabaseAdmin.from("fotos").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("grupos").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

    return {
      totalUsers: users.data?.users.length ?? 0,
      totalEncarregados: encs.count ?? 0,
      totalFotos: fotos.count ?? 0,
      totalGrupos: grupos.count ?? 0,
    };
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });
