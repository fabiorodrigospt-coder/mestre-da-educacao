# Ranking geral e por atividade — versão 1

Entrada pelo botão **Ranking** nas atividades do jogo. Consulta online autenticada; save recente precisa estar sincronizado. Empates compartilham posição. Classificação por categoria com paginação, posição do usuário mesmo fora da página e ficha com todas as parcelas da pontuação.

21 categorias: Geral; Aulas concluídas; PvP; Perguntas online; Debates NPC; Grandes Desafios (chefes distintos); Projetos; Patrimônio; Reputação; XP; Negócios; Escolas; Equipe; Missões; Conquistas; Habilidades; Atributos; Comércio; Prêmios diários; Operações dos colegas; Leilões.

Os dez personagens de QA receberam nomes fictícios em seus perfis e continuam identificados como **Simulado**. Filtros Todos / Jogadores reais / Personagens simulados. A coorte é mantida em tabela privada, sem escrita de jogadores e sem depender de nome ou metadata editável. A identificação não é falsa presença humana. Não há bônus por aparentar estar online.

## Pontuação geral

Soma das parcelas abaixo, arredondadas individualmente para baixo. `sqrt` significa raiz quadrada. As contagens de coleções são distintas, com limites compatíveis com o catálogo; campos inválidos/negativos não geram pontos.

| Parcela | Pontos |
|---|---:|
| Aulas concluídas | `floor(100 × sqrt(aulas))` |
| Vitórias em debates NPC | `floor(80 × sqrt(vitórias))` |
| Chefes diferentes superados | `300 × chefes` |
| Vitórias em projetos | `floor(100 × sqrt(vitórias))` |
| PvP | `floor(50 × sqrt(pontos PvP))` |
| Patrimônio (carteira + banco + caixa da equipe) | `floor(sqrt(patrimônio) / 2)` |
| Reputação | `floor(4 × sqrt(reputação))` |
| XP | `floor(3 × sqrt(XP))` |
| Unidades de negócios | `70 × unidades` |
| Escolas atualmente controladas | `200 × escolas` |
| Colegas contratados | `50 × colegas` |
| Missões concluídas e resgatadas | `30 × missões` |
| Conquistas resgatadas | `50 × conquistas` |
| Níveis adquiridos de habilidades | `15 × níveis` |
| Soma dos quatro atributos de base | `floor(10 × sqrt(soma))` |
| Lucro positivo do comércio | `floor(sqrt(lucro) / 4)` |
| Prêmios diários resgatados | `floor(30 × sqrt(resgates))` |
| Operações concluídas pelos colegas | `floor(30 × sqrt(operações))` |
| Leilões vencidos | `floor(40 × sqrt(vitórias))` |

Perguntas é uma categoria própria de vitórias online, já incluída nos pontos PvP; não soma a segunda vez no geral. PvP usa somente partidas finalizadas e ranqueadas (vitória 30, empate 10), respeitando a validade já atribuída pelo motor. Confrontos entre jogador real e simulado não contam para essa parcela. Os pesos são uma configuração inicial de progressão; não comprovam equilíbrio competitivo nem habilidade absoluta.

## Privacidade e integridade

A RPC calcula no banco a partir do último save de carreira e das partidas PvP. Não expõe e-mails, logs, tokens ou JSON bruto dos saves. Contas bloqueadas ficam fora. A carreira ainda pode ser editada/importada no cliente; portanto o ranking geral não é um sistema anti-cheat. PvP permanece validado no servidor. Essa distinção é informada na interface.

Migração `supabase/migrations/20261105075605_overall_rankings.sql`. As únicas alterações em perfis existentes são os nomes dos dez simulados autorizados; nome anterior preservado na tabela privada para reversão. Nenhum save/atributo/dinheiro foi alterado por essa migração.

## Validação

`npm ci && npm test`: testes do motor dos bots e oito cenários de ranking com PostgreSQL/PGlite. Integração remota somente leitura, usando uma conta QA existente: `node scripts-verify-rankings.mjs`. O arquivo local de credenciais não é versionado. Resultados em `docs/RANKING_REMOTE_RESULTS.json`.

Foram verificados também os ACLs das tabelas administrativas existentes: anon/authenticated não têm acesso direto. A leitura genérica do inventário sinalizou falta de RLS em duas tabelas privadas; isso não correspondeu à alegação de exposição pública após verificar os privilégios reais. Nenhuma permissão administrativa foi ampliada para implementar o ranking.
