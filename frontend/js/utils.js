function formatCurrency(v){ return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(v); }
function formatDate(d){
  if(!d || d==='—') return '—';
  try { const dt=new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('pt-BR'); } catch { return d; }
}
function formatDateTime(d){
  if(!d || d==='—') return '—';
  try { const dt=new Date(d.replace(' ','T')); if(isNaN(dt)) return d; return dt.toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}); } catch { return d; }
}
const PILARES = ['Mapeamento', 'Arquitetura', 'Banca', 'Aprovação'];
function clientePilar(cliente) {
  const n = Number(cliente?.pilar_atual);
  return (n >= 1 && n <= 4) ? Math.round(n) : 1;
}
function pilarLabel(n) { return 'Pilar ' + n + ' — ' + (PILARES[n - 1] || ''); }
function pilarNome(n) { return PILARES[n - 1] || ''; }
function pilarProgresso(n) { return Math.max(0, Math.min(100, Math.round(n * 25))); }
function formatCPF(v){
  const d = String(v||'').replace(/\D/g,'').slice(0,11);
  if (d.length > 9) return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6,9)+'-'+d.slice(9);
  if (d.length > 6) return d.slice(0,3)+'.'+d.slice(3,6)+'.'+d.slice(6);
  if (d.length > 3) return d.slice(0,3)+'.'+d.slice(3);
  return d;
}
function formatPhoneBR(v){
  const d = String(v||'').replace(/\D/g,'').slice(0,11);
  if (d.length > 10) return '('+d.slice(0,2)+') '+d.slice(2,7)+'-'+d.slice(7);
  if (d.length > 6) return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6);
  if (d.length > 2) return '('+d.slice(0,2)+') '+d.slice(2);
  if (d.length > 0) return '('+d;
  return d;
}
function badgeForStatus(status){
  const map={
    novo:'badge-neutral', em_conversa:'badge-info', call_marcada:'badge-warning', proposta_enviada:'badge-warning', fechado:'badge-success', perdido:'badge-danger',
    ativo:'badge-success', pausado:'badge-warning', concluido:'badge-info', cancelado:'badge-danger',
    agendado:'badge-info', realizado:'badge-success', remarcado:'badge-warning',
    pendente:'badge-warning', pago:'badge-success', atrasado:'badge-danger',
    rascunho:'badge-neutral', enviado:'badge-warning', assinado:'badge-success', visualizado:'badge-info'
  };
  return map[status]||'badge-neutral';
}
function labelForStatus(s){
  const m={ novo:'Novo', em_conversa:'Em conversa', call_marcada:'Call marcada', proposta_enviada:'Proposta enviada', fechado:'Fechado', perdido:'Perdido',
    ativo:'Ativo', pausado:'Pausado', concluido:'Concluído', cancelado:'Cancelado',
    agendado:'Agendado', realizado:'Realizado', remarcado:'Remarcado',
    pendente:'Pendente', pago:'Pago', atrasado:'Atrasado',
    rascunho:'Rascunho', enviado:'Enviado', assinado:'Assinado', visualizado:'Visualizado' };
  return m[s]||s;
}
