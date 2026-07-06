import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertAdmin,
  changeAuthUserPassword,
  confirmAuthUserEmail,
  createAuthUser,
  createLoginEncarregado,
  getLoginEncarregado,
  removeAuthUser,
  setAdminRole,
  setUserRole,
} from "@/lib/admin.server";

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const [{ data: profiles, error: profErr }, { data: roles, error: rolesErr }] =
      await Promise.all([
        context.supabase
          .from("profiles")
          .select("id, email, display_name, created_at")
          .order("created_at", { ascending: false }),
        context.supabase.from("user_roles").select("user_id, role"),
      ]);
    if (profErr) throw new Error(profErr.message);
    if (rolesErr) throw new Error(rolesErr.message);

    const rolesByUser = new Map<string, string[]>();
    for (const r of roles ?? []) {
      const arr = rolesByUser.get(r.user_id) ?? [];
      arr.push(r.role);
      rolesByUser.set(r.user_id, arr);
    }

    return {
      users: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email ?? "",
        created_at: p.created_at,
        last_sign_in_at: null as string | null,
        email_confirmed_at: null as string | null,
        roles: rolesByUser.get(p.id) ?? [],
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
    await assertAdmin(context.supabase, context.userId);
    return createAuthUser(data);
  });

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) {
      throw new Error("Você não pode excluir sua própria conta.");
    }
    await removeAuthUser(data.userId);
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
    await assertAdmin(context.supabase, context.userId);
    await changeAuthUserPassword(data.userId, data.password);
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
    await assertAdmin(context.supabase, context.userId);

    if (!data.isAdmin && data.userId === context.userId) {
      throw new Error("Você não pode remover seu próprio acesso de admin.");
    }

    await setAdminRole(data.userId, data.isAdmin);
    return { ok: true };
  });

export const setUserQualidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        userId: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    // Papel de Qualidade é representado pelo papel `analista`.
    await setUserRole(data.userId, "analista", data.enabled);
    return { ok: true };
  });

export const confirmUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ userId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    await confirmAuthUserEmail(data.userId);
    return { ok: true };
  });

export const getAdminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);

    const [users, encs, fotos, grupos] = await Promise.all([
      context.supabase.from("profiles").select("id", { count: "exact", head: true }),
      context.supabase.from("encarregados").select("id", { count: "exact", head: true }).eq("ativo", true),
      context.supabase.from("fotos").select("id", { count: "exact", head: true }),
      context.supabase.from("grupos").select("id", { count: "exact", head: true }).eq("ativo", true),
    ]);

    return {
      totalUsers: users.count ?? 0,
      totalEncarregados: encs.count ?? 0,
      totalFotos: fotos.count ?? 0,
      totalGrupos: grupos.count ?? 0,
    };
  });

export const criarLoginEncarregado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        encarregadoId: z.string().uuid(),
        email: z.string().trim().email().max(255),
        password: z.string().min(6).max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return createLoginEncarregado(data);
  });

export const infoLoginEncarregado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ encarregadoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return getLoginEncarregado(data.encarregadoId);
  });

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });
