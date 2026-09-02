# Diagnóstico inicial do login em produção

Data: 2026-09-01

O domínio `https://proferasmo.netlify.app/` carrega a interface do Simulado ENEM Interativo, com o botão `Acesso ao professor desenvolvedor` no rodapé. A aplicação expõe também um botão separado `Acesso aluno` no cabeçalho.

A página publicada responde e apresenta a experiência completa do simulado. O repositório atual está no commit `fe17899`, cujo arquivo `client/src/pages/Home.tsx` contém apenas o marcador inválido `<the new file content>`, mas o deploy publicado está servindo uma versão anterior funcional. O histórico completo possui uma versão funcional da Home no commit `0873666`.

A primeira tentativa automatizada de clicar no acesso docente não abriu o modal; será necessário repetir a reprodução com o elemento em viewport/DOM e inspecionar o código do fluxo de autenticação.


## Reprodução confirmada

No domínio publicado, o botão `Acesso ao professor desenvolvedor` abre o modal `Entrar para sincronizar` com campos de e-mail, senha, criação de conta e recuperação. O clique e a abertura visual do modal funcionam; o problema relatado não é a ausência do botão, e sim o resultado do envio do formulário/autenticação. A próxima verificação deve consultar `/.netlify/identity/settings` e o endpoint de token no domínio público.


## Teste controlado

Com e-mail e senha fictícios, o formulário aceitou a validação local e iniciou o estado `Processando`. A API pública do Identity respondeu `400 invalid_grant` para as mesmas credenciais, indicando que o serviço está ativo. É necessário aguardar a resposta visual para confirmar se o componente encerra o estado pendente e mostra a mensagem de erro.


## Resultado do teste

A tentativa fictícia terminou e o modal voltou ao estado normal, exibindo a mensagem traduzida de erro de credencial. Isso confirma que o envio ao Identity e o tratamento básico de erro estão ativos no deploy atual. O serviço Identity respondeu `200` em `/settings`, com login por e-mail habilitado e `autoconfirm: true`.

O ponto de risco do módulo docente permanece na regra de autorização: a interface só libera o modo docente quando o usuário tem exatamente o e-mail institucional autorizado e o papel `teacher`. O código atual não explica visualmente essa diferença depois de um login válido de uma conta sem o papel, o que pode ser percebido como “login não realizado”.


## Validação após publicação

O deploy `6a973bc74abd41ef167cafa6` foi publicado no site `proferasmo.netlify.app` e respondeu HTTP 200. O bundle público contém os marcadores da correção. Visualmente, o botão do rodapé abre o modal `Acesso do professor desenvolvedor`, que informa a exigência do e-mail `erasmo.borges@escola.pr.gov.br` e do papel `teacher` no Netlify Identity; a opção de criar conta foi removida desse fluxo para evitar cadastro de estudante no módulo docente.

## Validação do banco ampliado e gate institucional — 02/09/2026

O deploy `6a9846b0606b6b055fbef0ea` foi publicado no site `proferasmo` com estado `ready`. Na seção `#questoes`, o site inicialmente renderiza apenas o cartão de identificação obrigatória. O teste controlado com `aluno@gmail.com` foi rejeitado com a mensagem de domínio inválido. O teste controlado com `aluno.teste@escola.pr.gov.br` liberou a tentativa e exibiu 100 itens encontrados, com filtros de 25 itens para cada uma das quatro áreas, 20 páginas e limite de 3 tentativas. O conteúdo do banco público indica 1.500 itens autorais e contextualizados, 375 por área.

A validação técnica local passou com `pnpm check`, 7 arquivos de teste, 21 testes aprovados e `pnpm build` concluído. O seletor usa a identidade do e-mail e a tentativa como sementes, escolhe 25 itens por área sem repetição entre as três tentativas e embaralha as alternativas preservando o gabarito.

## Sincronização pelo GitHub — 02/09/2026

Como o push via terminal permaneceu indisponível, os arquivos foram enviados pela interface autenticada do GitHub diretamente à branch `main`. O repositório público registra os commits `bdbc971` (banco de 1.500 questões e wrapper de dados), `cc7a5f3` (autenticação docente) e `84c9d56` (Home com gate institucional e três tentativas). Os utilitários compartilhados foram registrados no commit `16cc1a3`. O repositório é `https://github.com/erasmocborges/simuladoenem`.
