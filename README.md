# Painel da banca Habbo

Painel de entradas, saídas e capital inicial em moedas, reais e mobis com login por e-mail e senha. Requer Node.js 22 ou superior. Sem dependências externas. Frontend em `src/`, APIs em `api/`, utilitários em `lib/`, SQL em `supabase/` e testes em `tests/`.

## Configurar Supabase

1. Crie um projeto no Supabase e execute `supabase/schema.sql` no SQL Editor uma vez. Ele cria a tabela e as políticas RLS por usuário.
2. Em Authentication, mantenha o provedor Email habilitado e desative novos cadastros públicos (Allow new users to sign up). O painel oferece login, sem cadastro público.
3. Em Authentication → Users, use Add user → Create new user para criar sua conta com e-mail e senha e confirmação de e-mail. Outras contas terão bancas independentes, sem compartilhamento.
4. Obtenha a URL do projeto e a chave pública publishable ou anon legada. Não use chave secret nem service_role, que podem ignorar as políticas RLS.

## Hospedar na Vercel

Importe o repositório na Vercel. O `vercel.json` define preset Other, build `npm run build` e saída `dist`. As funções de `api/` executam no servidor da Vercel.

Em Settings → Environment Variables configure:

- `SUPABASE_URL`: URL HTTPS do projeto, como `https://SEU-PROJETO.supabase.co`.
- `SUPABASE_ANON_KEY`: chave pública publishable ou anon.

Faça um novo deploy após configurar as variáveis. Entre com a conta criada no Supabase. Nenhuma publicação é realizada pelos comandos locais.

## Desenvolvimento local

Copie `.env.example` para `.env` e preencha as variáveis. Não envie `.env` ao Git.

```sh
npm run dev
```

Abra http://localhost:3000. O servidor atende a interface e as mesmas APIs da Vercel. Sem as variáveis, o login informa configuração pendente; não há autenticação simulada.

```sh
npm test
npm run lint
npm run build
```

Os testes usam node:test e simulam as chamadas ao Supabase. O lint verifica sintaxe JavaScript. O build gera os arquivos públicos em `dist/`, sem APIs nem segredos.

## Sessões e dados

A API valida a sessão no Supabase. Tokens ficam em cookies HttpOnly, SameSite=Strict e Secure na Vercel, sem exposição ao JavaScript ou localStorage. A sessão é renovada quando necessário; Sair revoga a sessão e limpa cookies. Escritas exigem a mesma origem. O Supabase fornece os limites de tentativas; configure-os conforme o uso. A redefinição de senha é gerenciada pelo administrador no Supabase.

Os registros são isolados por conta com RLS. Revisões impedem sobrescritas concorrentes: se outra aba ou dispositivo salvar primeiro, recarregue. O limite por salvamento é 3 MB. O arquivo de backup pode ter até 5 MB, mas os registros precisam caber no limite de salvamento. A importação substitui a banca da conta após confirmação. Exporte backups regularmente.

Para migrar a versão local, clique em “Baixar backup da versão local” no navegador e endereço originais. Depois entre na conta e use “Importar backup”. Se o endereço mudou, exporte no endereço antigo antes de migrar. Os dados locais antigos são preservados e não são importados automaticamente.

## Controle da banca

Cadastre o capital inicial em moedas, reais e mobis, separado dos recebimentos das apostas. Nos mobis iniciais, escolha um item do catálogo, quantidade e avaliação, adicione à lista e salve a banca. Para alterar um item inicial, remova e adicione novamente antes de salvar.

Os mobis do catálogo têm valores padrão editáveis. Cada entrada ou saída permite ajustar unidade e valor sem mudar o catálogo ou histórico. O gráfico agrupa dias com pontos igualmente espaçados.

A visão geral mostra moedas, reais e total avaliado em reais: saldo em reais + moedas a R$ 0,20 por moeda (1.000 moedas = R$ 200,00). Os saldos incluem avaliações de mobis e não representam apenas dinheiro disponível. Não há integração com Habbo, pagamentos ou apuração de resultados de apostas individuais.

Referências: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) e [funções Node.js da Vercel](https://vercel.com/docs/functions/runtimes/node-js).
