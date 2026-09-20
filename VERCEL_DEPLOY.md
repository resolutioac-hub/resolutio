# Guia de Implantação no Vercel — Resolutio Mentoria

Este repositório foi organizado e preparado para ser publicado no **Vercel** de forma simples e rápida.

---

## 📁 Estrutura de Pastas do Projeto

```
/ (Raiz do projeto)
├── vercel.json          <-- Configuração de rotas estáticas do Vercel
├── index.html           <-- Redirecionamento automático de entrada
├── package.json         <-- Identificador e scripts auxiliares
├── frontend/            <-- Aplicação Web (HTML, CSS, JS)
│   ├── index.html       <-- Página inicial / Login
│   ├── mentoria.html    <-- Método da Mentoria
│   ├── admin/           <-- Painel do Administrador
│   ├── funcionario/     <-- Painel dos Colaboradores (Comercial / Administrativo)
│   ├── cliente/         <-- Área do Aluno / Cliente
│   ├── css/             <-- Estilos e variáveis de design
│   ├── js/              <-- Motores de API e autenticação
│   └── assets/          <-- Logotipos e imagens
└── supabase/
    └── schema.sql       <-- Script do banco de dados PostgreSQL / Supabase
```

---

## 🚀 Como Publicar no Vercel (Passo a Passo)

### Opção 1: Pelo site da Vercel (Recomendado - 1 Clique)
1. Acesse [vercel.com](https://vercel.com) e faça login com sua conta (GitHub/GitLab).
2. Clique no botão **"Add New..."** ➔ **"Project"**.
3. Selecione o repositório **Resolutio** e clique em **Import**.
4. Mantenha as configurações padrão (o arquivo `vercel.json` na raiz já cuidará de todas as rotas).
5. Clique em **Deploy**. Pronto! Sua plataforma estará online com SSL grátis.

---

### Opção 2: Pelo Terminal (Vercel CLI)
Caso utilize a linha de comando do Vercel:
```bash
# 1. Instalar o CLI da Vercel (se ainda não tiver)
npm i -g vercel

# 2. Executar o deploy
vercel --prod
```

---

## 🔗 Links e Rotas do Sistema

Após a implantação no Vercel, as rotas estarão acessíveis da seguinte forma:

- **Página Inicial / Login**: `https://seu-dominio.vercel.app/`
- **Painel do Administrador**: `https://seu-dominio.vercel.app/admin/dashboard.html`
- **Painel do Colaborador**: `https://seu-dominio.vercel.app/funcionario/dashboard.html`
- **Área do Aluno**: `https://seu-dominio.vercel.app/cliente/dashboard.html`
- **Apresentação do Método**: `https://seu-dominio.vercel.app/mentoria.html`
