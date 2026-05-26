## Diagnóstico

O job está na fila há 1h+ e nunca iniciou (`iniciado_em = null` no banco). O endpoint funciona — quem não está chamando ele é o GitHub Action. Há 3 causas possíveis, todas do lado do **GitHub** (não do código nem do Lovable):

### Causa 1 — `RELATORIOS_WORKER_SECRET` não está nos Secrets do **repo GitHub**
O secret está cadastrado no Lovable (ok, isso serve pro servidor validar a chamada), **mas o workflow `.github/workflows/processar-relatorios.yml` lê de `${{ secrets.RELATORIOS_WORKER_SECRET }}`, que é o cofre do GitHub Actions — outro lugar.** Se não existir lá, o workflow aborta logo no início (`exit 1`) sem chamar o endpoint.

### Causa 2 — `repository_dispatch` não está disparando
O serverFn `enfileirarRelatorio` chama `POST api.github.com/repos/{repo}/dispatches` usando `GITHUB_DISPATCH_TOKEN`. Se o token não tem scope `repo` (clássico) ou `contents: write + actions: write` (fine-grained), o dispatch retorna 401/403 silenciosamente (o código engole o erro). E o cron `*/5` só roda quando o workflow já está no branch **default** (main).

### Causa 3 — Actions está desativado no repo
Repos novos às vezes vêm com Actions desabilitado, ou foi desativado em Settings → Actions.

---

## Como confirmar (você faz, 2 min)

1. Abre `https://github.com/{seu-usuario}/group-pic-guardian/actions`
   - **Aparece a workflow "Processar Relatórios de Vistoria" listada na lateral esquerda?** Se não → o arquivo não está no branch `main` ainda (Actions só lista workflows do default branch).
   - **Aparece o botão "I understand my workflows, go ahead and enable them"?** → Actions está desativado, clica pra ativar.
   - **Tem execuções (mesmo que vermelhas)?** Clica na última e me manda print dos logs.

2. Abre `https://github.com/{seu-usuario}/group-pic-guardian/settings/secrets/actions`
   - Verifica se existe um secret chamado **exatamente** `RELATORIOS_WORKER_SECRET` (case-sensitive).
   - Se não existir, cadastra agora com o **mesmo valor** que está no Lovable.

---

## Plano de correção (eu faço depois que você confirmar o estado acima)

Dependendo do que aparecer:

### Cenário A — Workflow não aparece no GitHub (arquivo não chegou no main)
- Verificar conexão GitHub do projeto Lovable e forçar sync.
- Confirmar que `.github/workflows/processar-relatorios.yml` está no branch default.

### Cenário B — Secret faltando no GitHub
- Você adiciona `RELATORIOS_WORKER_SECRET` em Settings → Secrets → Actions com o mesmo valor do Lovable. Sem mudança de código.

### Cenário C — Token de dispatch sem permissão
- Você gera um PAT novo com scope `repo` (ou fine-grained com `actions: write` + `contents: read` no repo específico) e atualiza o secret `GITHUB_DISPATCH_TOKEN` no Lovable.
- Eu adiciono log de erro no `enfileirarRelatorio` pra capturar status HTTP da chamada `api.github.com/...dispatches` (hoje é silenciado com `catch {}`), pra você ver no log do server se o dispatch falhar de novo.

### Cenário D — Tudo certo mas demora
- Ativar o `workflow_dispatch` manual (já está no yml) e disparar 1x à mão pelo botão "Run workflow" do GitHub Actions só pra desbloquear o job atual da fila.

### Independente do cenário — melhorias defensivas que vou aplicar
1. **Log visível** do resultado do `repository_dispatch` no serverFn (status + body em caso de erro não-2xx), pra próxima vez não ficar adivinhando.
2. **Cartão de job** mostra "há X min na fila" e, se passar de 5 min sem iniciar, exibe aviso com link pra GitHub Actions e instruções rápidas.
3. **Botão "Cancelar"** no job travado (hoje só tem retry).

---

## Próximo passo

Faz a checagem dos 2 pontos acima (Actions tab + Secrets tab) e me manda print do que aparecer. Aí eu sei exatamente qual cenário aplicar.