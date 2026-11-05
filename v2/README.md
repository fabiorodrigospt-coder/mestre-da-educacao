# Mestre da Educação 2.0 — Alpha isométrico

Versão **separada** em `/v2/`. Os arquivos originais `index.html`, `cloud.js`, `pvp.js`, `admin.html` e o banco Supabase **não são modificados** por esta etapa.

## Escopo implementado
- Renderização 3D genuína com Three.js 0.187.0 por import map; câmera ortográfica.
- Cenário construído por primitivas: pátio, corredor, sala de aula, biblioteca, gestão e arena.
- Avatar do professor: joystick virtual, WASD/setas, clique/toque no chão, câmera que segue o personagem, zoom.
- Dez NPCs ambientais com máquinas simples de movimentação (somente locais, sem progresso no banco).
- Cinco pontos interativos: reforço escolar, biblioteca, PvP, ranking e gestão.
- Integração por iframe *same-origin* com a aplicação original. O iframe carrega o motor de conta e save existente, sem nova economia nem outro cadastro.
- Uma ação de aula real: aciona o botão `data-action="crime" data-id="pocket"` existente **exatamente uma vez**; verifica se o save realmente mudou antes de anunciar o resultado. A interface 3D não grava dinheiro, XP ou reputação diretamente.
- Botão **Jogo clássico** exibe o iframe para continuar usando toda a interface original, PvP e ranking.

## Como testar
1. Abra `/v2/` no **mesmo navegador** do jogo normal.
2. Se aparecer "Conecte sua conta", toque em **Abrir login do jogo** e entre na sua conta.
3. Toque em **Voltar à escola 3D**. Caminhe com joystick ou toque no chão.
4. Vá até o marcador dourado perto da sala de aula e inicie **Reforço Escolar**.
5. Verifique energia, dinheiro, reputação/XP no HUD e no jogo clássico.
6. Teste Biblioteca, Arena PvP, ranking e Gestão.
7. Encerre e reabra para conferir os dados.
8. Feche outras abas do jogo antes de uma aula: o motor original tem um bloqueio de múltiplas abas para impedir conflito de saves.

## Restrições conhecidas
- A primeira carga do Three.js vem do CDN: **o mundo 3D ainda não é offline**. O jogo tradicional continua com seu comportamento atual.
- Os NPCs desta alpha são apenas ambientais. Os dez participantes simulados já cadastrados no banco **não são controlados por esta interface**, nem ganharam agendamento persistente nesta etapa.
- PvP, ranking e gestão abrem a experiência existente em um iframe de tela cheia; ainda não são renderizados como arenas 3D.
- O jogo tradicional reserva o controle do save a uma única aba; esta alpha reutiliza esse mecanismo e não substitui o sistema de sincronização.
- Renderização móvel e a ponte de aula precisam de testes reais no Android antes de homologação.
- Protótipo publicado em caminho de teste de repositório público. **Não inserir dados sensíveis neste código.**

## Próximas etapas
1. Medir FPS, memória e tempo de carregamento no Android.
2. Criar um adaptador explícito de ações no motor existente e retirar o acoplamento com seletor DOM/iframe, com testes de regressão de save e de idempotência de recompensa.
3. Criar navegação de NPCs com obstáculos, estados de ensino e programação de aula.
4. Implementar presença multiplayer (Supabase Realtime) com RLS/regras de acesso adequadas.
5. Implementar scheduler de professores simulados (servidor) e painel de auditoria.
6. Criar homologação isolada com cenários automatizados e liberar a versão principal apenas após aprovação.
