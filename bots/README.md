# Bots QA — execução e limites

## Operação
- Dez identidades `[BOT QA] 01` a `[BOT QA] 10`, exclusivas do projeto `wsxmrysizwetxxshxwan`.
- Carreira executa as funções do `index.html` versionado, em Node VM, substituindo somente DOM, apresentação e armazenamento local. Não duplica fórmulas de recompensa.
- Inteligência de decisão sorteada por conta (20%–95%); não altera atributos iniciais, dinheiro, energia ou XP. Não usa modelos de IA pagos.
- Sessões reais de 120 segundos a cada hora, minuto 17 UTC. Dez motores simultâneos; decisões a cada 15 segundos; timers a cada segundo. Não equivale a jogar 24 horas por dia. GitHub pode atrasar execuções.
- Interação de carreira: aulas, trabalho, missões, recompensas, habilidades, materiais, cafés, negócios, colegas/projetos, profissões, escolas, chefes, arena local, comércio e leilão, conforme requisitos e política aleatória. Nem todo recurso é alcançado imediatamente.
- Cinco debates PvP entre pares de bots por execução; chamadas usam autenticação individual e RPC oficial. Contas humanas nunca são escolhidas pelo agendador. Partidas aparecem identificadas pelos nomes BOT QA e podem pontuar no ranking existente.
- Quiz, instalação PWA e interface visual ainda não são cobertos por esta política. Os testes do motor não substituem testes de interface nem reproduzem comportamento humano.

## Ativação
1. Secret de repositório GitHub Actions `MESTRE_BOT_ACCOUNTS`: array JSON com exatamente dez contas `{id,email,password,intelligence}`. Nunca versionar esse JSON.
2. Variable `MESTRE_BOTS_ENABLED=true`. Ausência da variável mantém o job desativado.
3. Executar o workflow manualmente e verificar dez saves, cinco partidas e zero erros no relatório.
4. Para pausar: remover a variável ou definir `false`. Não remove contas/progresso.

Workflow sem service_role, com `contents:read`, concorrência única e limite de 12 minutos. Utiliza runner padrão Linux no repositório público, sem serviços pagos. Não habilitar cobrança ou runner pago. Agendamentos do GitHub podem ser desativados após 60 dias sem atividade no repositório; conferir o último registro no painel.

## Métricas e diagnóstico
Painel administrativo → **Bots e evolução**: inteligência de decisão, nível XP, patente por reputação, aulas concluídas/falhas, XP por sessão, sessões, tempo ativo observado, tempo corrido e primeira observação de níveis novos. Carreira salva no Supabase via RLS/CAS de revisão; conflitos preservam alteração remota. Resumo usa a RPC de atividade existente, com timestamp de recepção do servidor.

Marcos são observações ao salvar, não horário exato do instante da subida. O campo `engine_sha256` identifica a versão avaliada. Mudanças de versão devem ser consideradas na análise. Erros de login/save/PvP geram workflow com falha e artefato JSON por 30 dias. Não há detecção exaustiva de defeitos. Conta parada não significa ausência de bugs.

## Validação
`node --test tests/bots.test.mjs` testa isolamento, energia/economia, normalização/persistência, tempo offline, política de combate e reprodutibilidade. Simulações locais usam relógio controlado apenas nos testes; o runner online usa relógio real, sem acelerar evolução.

Provisão: `python bots/provision.py` cria dez contas uma única vez e grava credenciais locais com permissão 0600, ignoradas pelo git. Interrompe no primeiro erro e não apaga/reset contas existentes. Não executar provisão em outra máquina para evitar uma segunda coorte.
