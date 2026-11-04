# Mestre da Educação — Painel Administrativo

## Estado da entrega
- Painel: admin.html, admin/dashboard.js.
- SQL de implantação: admin/migration.sql.
- Compatibilidade dos saves: cloud.js; atualização do cache: sw.js.
- Publicado em 04/11/2026 após autorização do titular: https://fabiorodrigospt-coder.github.io/mestre-da-educacao/admin.html
- Migração aplicada no projeto wsxmrysizwetxxshxwan. Há um único administrador inicial, com e-mail verificado.
- Backup das três partidas e das políticas anteriores mantido em tabelas privadas mestre_saves_backup_20261104_admin e mestre_policies_backup_20261104_admin; nenhum acesso de anon/authenticated.
- As três partidas foram comparadas após a migração: estado e revisão preservados.
- Treze verificações SQL funcionais aprovadas em transação revertida antes da ativação, incluindo RLS, moderação, auditoria e conflito de revisão.
- Após ativação, confirmados: autorização do administrador, listagem das quatro contas e negação a anon.
- Tela de login publicada sem erros de console; largura móvel de 390px sem overflow horizontal. Login completo e interface autenticada dependem de o titular entrar com sua senha; não foram certificados por este teste.

## Controle de acesso
- O navegador usa somente a chave pública do Supabase.
- Toda consulta e alteração administrativa exige um JWT autenticado e a condição de administrador na tabela privada private.mestre_educacao_admins.
- Nenhuma conta recebe permissão de administrador por nome, e-mail informado pelo próprio usuário ou dados editáveis de perfil.
- Contas comuns só podem consultar seus dados. Banimento e suspensão impedem leitura e escrita de saves online.
- Histórico registra responsável, alvo, operação, motivo e valores alterados.
- O navegador ainda executa o jogo e mantém save local. Portanto esta versão NÃO impede trapaças nem garante bloqueio offline imediato.

## Procedimento de implantação e recuperação
1. Fazer backup da base de dados do projeto Mestre da Educação.
2. Confirmar exatamente qual conta cadastrada no jogo pertence ao administrador. Nunca escolher pelo primeiro cadastro. O campo auth.users.email_confirmed_at deve estar preenchido; uma conta ainda não verificada não recebe autorização.
3. Aplicar a migração SQL de admin/migration.sql no projeto Supabase Mestre da Educação. Não utilizar nenhum projeto do Guedes Hub.
4. Conferir que a migração criou os perfis, funções, triggers e as colunas admin_revision e ack_admin_revision.
5. Com o ID confirmado, conceder permissão via SQL Editor (trocar o endereço por um e-mail VERIFICADO):
   insert into private.mestre_educacao_admins(user_id) select id from auth.users where lower(email)=lower('EMAIL_DA_CONTA_JOGO_CONFIRMADA') and email_confirmed_at is not null on conflict(user_id) do nothing;
6. Validar autorizações negativas: uma conta comum não consegue acessar as quatro RPCs administrativas nem consultar outros jogadores.
7. Testar em hospedagem separada, só depois decidir se será feito o merge na branch main.

## Testes funcionais
- Login de administrador: mostra jogadores, e-mail, data, status e existência de save.
- Login de jogador comum na página admin: acesso negado.
- Editar dinheiro, banco, reputação, energia, XP, quatro atributos e rating; conferir resultado e auditoria.
- Criar conflito de revisões entre dois dispositivos: o servidor rejeita atualização administrativa com revisão antiga.
- Editar a partir do admin e depois sincronizar save local desatualizado: carregar a partida administrada, preservando backup se havia dados locais pendentes.
- Suspender por 1 minuto: leitura e escrita online negadas até expirar; liberadas após.
- Banir sem prazo: acesso online negado; reativar restaura acesso.
- Testar troca de sessão, senha incorreta e tentativa de banir a própria conta admin.
- Instalar PWA e confirmar que a nova versão do cache não usa cloud.js antigo.
- Inspecionar Supabase Database Advisors após migração.

## Funcionalidades não incluídas ainda
- Exclusão de contas, exclusão de saves, gerenciador de equipamentos/inventário, edição arbitrária de JSON, bloqueio remoto de cliente offline, proteção competitiva anti-trapaça.
- Publicação e designação do primeiro administrador concluídas; não adicionar administradores sem identificação segura e autorização do titular.
