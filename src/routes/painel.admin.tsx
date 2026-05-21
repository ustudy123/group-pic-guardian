import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Users,
  UserPlus,
  Trash2,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  MailCheck,
  Camera,
  HardHat,
  MessageSquare,
  Loader2,
} from "lucide-react";
import {
  listUsers,
  createUser,
  deleteUser,
  updateUserPassword,
  setUserAdmin,
  confirmUserEmail,
  getAdminStats,
  checkIsAdmin,
} from "@/lib/admin.functions";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/painel/admin")({
  component: AdminPanel,
});

function AdminPanel() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const fnCheck = useServerFn(checkIsAdmin);
  const fnList = useServerFn(listUsers);
  const fnStats = useServerFn(getAdminStats);
  const fnCreate = useServerFn(createUser);
  const fnDelete = useServerFn(deleteUser);
  const fnPwd = useServerFn(updateUserPassword);
  const fnRole = useServerFn(setUserAdmin);
  const fnConfirm = useServerFn(confirmUserEmail);

  const { data: adminCheck, isLoading: checking } = useQuery({
    queryKey: ["is-admin"],
    queryFn: () => fnCheck(),
  });

  useEffect(() => {
    if (!checking && adminCheck && !adminCheck.isAdmin) {
      toast.error("Acesso restrito a administradores.");
      navigate({ to: "/painel" });
    }
  }, [checking, adminCheck, navigate]);

  const { data: usersData, isLoading: loadingUsers } = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fnList(),
    enabled: !!adminCheck?.isAdmin,
  });

  const { data: stats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => fnStats(),
    enabled: !!adminCheck?.isAdmin,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-stats"] });
  };

  // criar usuário
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);

  const createMut = useMutation({
    mutationFn: (vars: { email: string; password: string; isAdmin: boolean }) =>
      fnCreate({ data: vars }),
    onSuccess: () => {
      toast.success("Usuário criado.");
      setNewEmail("");
      setNewPassword("");
      setNewIsAdmin(false);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (userId: string) => fnDelete({ data: { userId } }),
    onSuccess: () => {
      toast.success("Usuário excluído.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pwdMut = useMutation({
    mutationFn: (vars: { userId: string; password: string }) =>
      fnPwd({ data: vars }),
    onSuccess: () => toast.success("Senha atualizada."),
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMut = useMutation({
    mutationFn: (vars: { userId: string; isAdmin: boolean }) =>
      fnRole({ data: vars }),
    onSuccess: () => {
      toast.success("Permissão atualizada.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmMut = useMutation({
    mutationFn: (userId: string) => fnConfirm({ data: { userId } }),
    onSuccess: () => {
      toast.success("E-mail confirmado.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (checking || !adminCheck?.isAdmin) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="animate-spin mr-2" size={18} /> Verificando acesso...
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="text-primary" size={24} />
          Painel Administrativo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie usuários, permissões e veja um resumo do sistema.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<Users size={18} />} label="Usuários" value={stats?.totalUsers} />
        <StatCard icon={<HardHat size={18} />} label="Encarregados" value={stats?.totalEncarregados} />
        <StatCard icon={<Camera size={18} />} label="Fotos" value={stats?.totalFotos} />
        <StatCard icon={<MessageSquare size={18} />} label="Grupos ativos" value={stats?.totalGrupos} />
      </div>

      {/* Criar usuário */}
      <section className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <UserPlus size={18} /> Cadastrar novo usuário
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newEmail || newPassword.length < 6) {
              toast.error("Informe e-mail e senha (mín. 6 caracteres).");
              return;
            }
            createMut.mutate({
              email: newEmail,
              password: newPassword,
              isAdmin: newIsAdmin,
            });
          }}
          className="grid md:grid-cols-[1fr_1fr_auto_auto] gap-3 items-end"
        >
          <div>
            <label className="text-xs text-muted-foreground">E-mail</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-background"
              placeholder="usuario@empresa.com"
              required
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Senha inicial</label>
            <input
              type="text"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border rounded-md px-3 py-2 bg-background"
              placeholder="mín. 6 caracteres"
              minLength={6}
              required
            />
          </div>
          <label className="flex items-center gap-2 text-sm whitespace-nowrap pb-2">
            <input
              type="checkbox"
              checked={newIsAdmin}
              onChange={(e) => setNewIsAdmin(e.target.checked)}
            />
            Admin
          </label>
          <button
            type="submit"
            disabled={createMut.isPending}
            className="bg-primary text-primary-foreground rounded-md px-4 py-2 hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {createMut.isPending && <Loader2 className="animate-spin" size={14} />}
            Criar
          </button>
        </form>
        <p className="text-xs text-muted-foreground mt-3">
          O e-mail já é confirmado automaticamente. O usuário pode trocar a senha em "Alterar senha" na tela de login.
        </p>
      </section>

      {/* Lista */}
      <section className="rounded-lg border bg-card">
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users size={18} /> Usuários ({usersData?.users.length ?? 0})
          </h2>
        </div>

        {loadingUsers ? (
          <div className="p-8 text-center text-muted-foreground">
            <Loader2 className="animate-spin inline mr-2" size={16} /> Carregando...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">E-mail</th>
                  <th className="px-4 py-2 font-medium">Papel</th>
                  <th className="px-4 py-2 font-medium">Confirmado</th>
                  <th className="px-4 py-2 font-medium">Último login</th>
                  <th className="px-4 py-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usersData?.users.map((u) => {
                  const isAdmin = u.roles.includes("admin");
                  const isSelf = u.id === user?.id;
                  return (
                    <tr key={u.id} className="border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.email}</div>
                        {isSelf && (
                          <div className="text-xs text-muted-foreground">(você)</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isAdmin ? (
                          <span className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                            <ShieldCheck size={12} /> Admin
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Usuário</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {u.email_confirmed_at ? (
                          <span className="text-xs text-green-600">Sim</span>
                        ) : (
                          <button
                            onClick={() => confirmMut.mutate(u.id)}
                            className="text-xs inline-flex items-center gap-1 text-amber-600 hover:underline"
                          >
                            <MailCheck size={12} /> Confirmar
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end flex-wrap">
                          <IconBtn
                            title="Redefinir senha"
                            onClick={() => {
                              const pwd = prompt(
                                `Nova senha para ${u.email} (mín. 6 caracteres):`,
                              );
                              if (pwd && pwd.length >= 6) {
                                pwdMut.mutate({ userId: u.id, password: pwd });
                              } else if (pwd !== null) {
                                toast.error("Senha muito curta.");
                              }
                            }}
                          >
                            <KeyRound size={14} />
                          </IconBtn>
                          {!isSelf && (
                            <IconBtn
                              title={isAdmin ? "Remover admin" : "Tornar admin"}
                              onClick={() =>
                                roleMut.mutate({
                                  userId: u.id,
                                  isAdmin: !isAdmin,
                                })
                              }
                            >
                              {isAdmin ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                            </IconBtn>
                          )}
                          {!isSelf && (
                            <IconBtn
                              title="Excluir usuário"
                              danger
                              onClick={() => {
                                if (
                                  confirm(`Excluir o usuário ${u.email}? Esta ação é permanente.`)
                                ) {
                                  delMut.mutate(u.id);
                                }
                              }}
                            >
                              <Trash2 size={14} />
                            </IconBtn>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-2xl font-bold mt-1">{value ?? "—"}</div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded-md border hover:bg-accent transition ${
        danger ? "text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30" : ""
      }`}
    >
      {children}
    </button>
  );
}
