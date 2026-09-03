# Chima Store — PDV/ERP

Sistema de ponto de venda e gestão de estoque, com login real e dados
compartilhados entre todos os dispositivos da loja (Supabase + Vercel).

## 1. Criar o banco de dados (Supabase — grátis)

1. Crie uma conta em https://supabase.com e um novo projeto.
2. Vá em **SQL Editor → New query**, cole todo o conteúdo do arquivo
   `supabase/schema.sql` deste projeto e clique em **Run**. Isso cria as
   tabelas `profiles` (usuárias) e `store_data` (peças, clientes, vendas,
   caixa etc.) já com as permissões corretas.
3. Vá em **Authentication → Providers → Email** e confira se "Email"
   está habilitado (vem habilitado por padrão).
4. (Recomendado para começar rápido) Em **Authentication → Settings**,
   desative **"Confirm email"** durante os testes — assim quem se
   cadastra já entra na hora, sem precisar clicar em link de e-mail.
   Você pode reativar depois, quando a loja já estiver em uso normal.
5. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**

## 2. Configurar as variáveis de ambiente

Copie `.env.example` para `.env` e preencha com os valores do passo 1:

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=SUA_CHAVE_ANON_PUBLIC
```

## 3. Rodar localmente (opcional, para testar antes de publicar)

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal. Crie sua conta — a primeira conta
criada vira automaticamente **administradora** da loja.

## 4. Publicar na Vercel

1. Suba esta pasta para um repositório no GitHub (ou GitLab/Bitbucket).
2. Em https://vercel.com, clique em **Add New → Project** e importe o
   repositório. A Vercel detecta automaticamente que é um projeto Vite.
3. Em **Environment Variables**, adicione as duas mesmas variáveis do
   passo 2 (`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`).
4. Clique em **Deploy**.

Pronto — o link gerado pela Vercel já pode ser usado em qualquer
computador, tablet ou celular da loja. Todos verão os mesmos dados,
atualizados em tempo real.

## Como funciona o acesso de usuárias

- Qualquer pessoa pode criar a própria conta na tela de login (isso
  substitui o antigo "modo demonstração").
- A **primeira conta criada** vira administradora automaticamente.
- Contas seguintes entram como **caixa** (acesso a PDV, clientes e
  caixa do dia).
- Uma administradora pode promover, rebaixar ou remover o acesso de
  qualquer conta em **Configurações → Usuárias**.
- As senhas são gerenciadas pelo Supabase Auth (armazenadas de forma
  segura e criptografada — não ficam em texto puro em lugar nenhum).

## Limitações a saber

- **store_data é um único registro compartilhado.** Isso é ótimo para
  ver os mesmos dados em qualquer dispositivo, mas se duas pessoas
  salvarem alterações no exato mesmo segundo, a última a salvar
  prevalece (não há mesclagem campo a campo). Para o dia a dia de uma
  loja pequena isso raramente é um problema, mas é bom saber.
- **Remover o acesso de uma usuária** apaga o perfil dela (ela não
  consegue mais entrar no sistema), mas não apaga a conta de login em
  si dentro do Supabase. Para excluir a conta por completo, isso pode
  ser feito manualmente em Supabase → Authentication → Users.
