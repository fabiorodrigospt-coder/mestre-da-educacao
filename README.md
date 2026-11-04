# MESTRE DA EDUCAÇÃO — Amigos, cadastro imediato (sem confirmação de e-mail)

## 1. Estado do projeto (04/11/2026)
- **Código preparado**: cadastro com nome/e-mail/senha, login, PWA, salvamento local e sincronização.
- **Supabase criado e banco configurado**: Projeto `Mestre da Educação`, ID `wsxmrysizwetxxshxwan`, organização `fabiorodrigospt-coder's Org` (isolado do Guedes Hub), região Londres, plano Free.
- Tabela `public.mestre_educacao_saves` criada com três políticas Row Level Security: o jogador só pode ler/criar/alterar a própria partida.
- Chave **pública** do novo Supabase já inserida em `config.js`.
- **Configuração PENDENTE no Dashboard**: é necessário desligar **Confirm Email** manualmente. A integração do Supabase disponível neste ambiente não oferece escrita nessa configuração. A mudança NÃO foi feita.
- **GitHub Pages NÃO publicado**: falta criar repositório separado e ativar a hospedagem.
- **Testes reais de cadastro/login no Supabase não feitos**: não envie convites aos amigos antes de confirmar a operação na URL pública.

## 2. Única mudança obrigatória para cadastro sem e-mail
1. Abra https://supabase.com/dashboard/project/wsxmrysizwetxxshxwan
2. Entre em **Authentication > Sign In / Providers > Email**.
3. Confirme que o provedor de e-mail/senha está habilitado.
4. **DESATIVE `Confirm Email`** e salve.
5. Em **Authentication > General configuration** mantenha **Allow new users to sign up** ATIVADO.
6. Agora, em novos cadastros, o Supabase Auth retorna uma sessão imediatamente; o jogo abre após o cadastro, sem clicar em link de confirmação.

**Atenção:** desligar Confirm Email reduz a proteção contra cadastro com endereço de e-mail de outra pessoa. É adequado somente com risco aceito para esta fase restrita entre amigos. A URL não é privada por si só: qualquer pessoa que tenha o endereço pode criar conta. Evite divulgar amplamente; monitore novas contas e abuse de rate limits/captcha se houver exposição.

**Sem SMTP:** cadastro e login com senha podem funcionar sem enviar e-mails. **Recuperação de senha por e-mail não funciona** até configurar envio; por isso, o link de recuperação está oculto por padrão. Os jogadores precisam guardar a senha. Para habilitar a recuperação depois, configure SMTP e `Authentication > URL Configuration`, então altere `emailRecoveryEnabled` para `true` em `config.js` e publique nova versão.

## 3. Publicar em um repositório GitHub NOVO
1. Abra https://github.com/new e crie um repositório chamado `mestre-da-educacao`, preferencialmente PUBLIC (GitHub Free + Pages).
2. Extraia o ZIP e faça upload dos arquivos diretamente para a raiz do repositório. `index.html` deve estar na raiz.
3. Em `Settings > Pages`, selecione `Deploy from a branch` > `main` > `/(root)` e salve.
4. Acesse o endereço mostrado em `Settings > Pages > Visit site`.
5. Para futuras recuperações de senha, configure no Supabase `Authentication > URL Configuration` o **Site URL** e **Redirect URLs** conforme o URL real do jogo.
6. Não publique em `guedeshub`, `guedeshubapp` nem `guedes.hub`.

## 4. Instalação no celular
- Android/Chrome: após login, o jogo apresenta um convite para instalar. A disponibilidade do aviso nativo é controlada pelo navegador.
- iPhone/Safari: Compartilhar > Adicionar à Tela de Início.
- HTTPS (GitHub Pages) e primeira abertura com internet são necessários. O cache PWA permite abrir offline após a instalação/carregamento, desde que exista uma sessão e partida locais.

## 5. Migrar partida antiga
1. No HTML original, abra Configurações > Dados > Exportar save (.json).
2. No jogo online, crie conta e entre.
3. Abra Configurações > Dados > Importar save (.json).
4. Use Sincronizar / resolver conflito e observe o status de salvamento.

## 6. Arquivos
- `index.html` — jogo com interface de autenticação atualizada.
- `cloud.js` — cadastro/login, save por usuário e sincronização.
- `config.js` — URL e chave **pública** do projeto Supabase, com `emailRecoveryEnabled:false`.
- `supabase.sql` — documentação da migração já executada. **Não é necessário executar novamente**.
- `sw.js`, `manifest.webmanifest`, `icons/` — PWA instalável.
- `.nojekyll` — publicação estática no GitHub Pages.

## 7. Limitações
- O jogo roda no navegador; o estado da partida pode ser editado localmente pelo jogador. Não há anti-cheat para rankings competitivos.
- A alteração do parâmetro **Confirm Email** precisa ser salva no painel Supabase. O aplicativo sozinho não pode contornar essa configuração do servidor.
- Salvamento na nuvem depende de conexão, pode ter atraso, e dispositivos divergentes pedem resolução do conflito.
- A funcionalidade 'Esqueci minha senha' foi escondida até que exista um sistema de envio de e-mails.
- Recomendamos backup em JSON antes de resetar/importar partidas.

Referências: https://supabase.com/docs/guides/auth/general-configuration e https://supabase.com/docs/guides/auth/passwords
