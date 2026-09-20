// Helper de Navegação Dinâmica para Funcionários por Função (Comercial, Administrativo, Diretora)

function renderFuncionarioNav(activePage = 'dashboard') {
  const { user } = getSession();
  const userEmail = (user?.email || '').toLowerCase();
  const userName = (user?.nome || '').toLowerCase();

  // Buscar funcionario na base de dados para ler funcao exata
  let roleId = 'diretora_academica'; // default fallback
  try {
    const db = getDB();
    const func = (db.funcionarios || []).find(f => (f.email && f.email.toLowerCase() === userEmail) || (f.nome && f.nome.toLowerCase() === userName));
    if (func && func.funcao) {
      roleId = func.funcao;
    } else if (userName.includes('eduarda') || userEmail.includes('comercial')) {
      roleId = 'comercial';
    } else if (userName.includes('rocha') || userEmail.includes('admin') || userEmail.includes('financeiro')) {
      roleId = 'administrativo_financeiro';
    }
  } catch (e) {
    console.warn('Erro ao obter funcao do funcionario', e);
  }

  const navContainer = document.getElementById('dynamicNav');
  if (!navContainer) return;

  const items = [
    { id: 'dashboard', label: 'Início', href: './dashboard.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>', roles: ['comercial', 'administrativo_financeiro', 'diretora_academica'] },
    { id: 'leads', label: 'Leads (Pipeline)', href: './leads.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 6h16M4 12h10M4 18h16"/></svg>', roles: ['comercial', 'diretora_academica'] },
    { id: 'clientes', label: 'Meus clientes', href: './clientes.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3"/></svg>', roles: ['comercial', 'administrativo_financeiro', 'diretora_academica'] },
    { id: 'agendamento', label: 'Agenda', href: './agendamento.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>', roles: ['comercial', 'administrativo_financeiro', 'diretora_academica'] },
    { id: 'materiais', label: 'Materiais', href: './materiais.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>', roles: ['comercial', 'administrativo_financeiro', 'diretora_academica'] },
    { id: 'contratos', label: 'Contratos', href: './contratos.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M10 13H8M10 17H8M14 13h4M14 17h4"/></svg>', roles: ['administrativo_financeiro', 'diretora_academica'] },
    { id: 'financeiro', label: 'Financeiro', href: './financeiro.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h4M6 14h7"/></svg>', roles: ['administrativo_financeiro', 'diretora_academica'] }
  ];

  const allowedItems = items.filter(item => item.roles.includes(roleId) || roleId === 'diretora_academica');

  navContainer.innerHTML = `
    <div class="nav__label">Menu (${roleId === 'comercial' ? 'Comercial' : roleId === 'administrativo_financeiro' ? 'Administrativo' : 'Diretoria'})</div>
    ${allowedItems.map(item => `
      <a class="nav__item ${item.id === activePage ? 'nav__item--active' : ''}" href="${item.href}">
        <span class="nav__icon">${item.icon}</span> ${item.label}
      </a>
    `).join('')}
  `;
}
