# Guia de Implantação no Vercel — Resolutio Mentoria

O projeto foi totalmente movido para a **raiz do repositório**. Desta forma, o Vercel detecta a página `index.html` e todas as subpastas automaticamente!

---

## 📁 Estrutura Atualizada do Projeto na Raiz

```
/ (Raiz do repositório)
├── index.html           <-- Página Inicial / Login Principal
├── mentoria.html        <-- Apresentação do Método
├── vercel.json          <-- Configuração Vercel
├── package.json         <-- Metadados Vercel
├── admin/               <-- Painel do Administrador
├── funcionario/         <-- Painel dos Colaboradores (Comercial / Administrativo)
├── cliente/             <-- Área do Aluno / Cliente
├── css/                 <-- Estilos e Design System
├── js/                  <-- Motores de API e Autenticação
└── assets/              <-- Logotipos e imagens
```

---

## 🚀 Como Publicar no Vercel (1 Clique)

1. Acesse **[vercel.com](https://vercel.com)** ➔ Clique em **Add New...** ➔ **Project**.
2. Selecione o repositório **Resolutio** e clique em **Import**.
3. Deixe todas as opções em padrão e clique em **Deploy**.
4. O Vercel publicará o site instantaneamente sem erros de 404!
