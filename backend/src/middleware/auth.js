// Middleware de autenticação — verifica header Authorization: Bearer <supabase_jwt>
// Por enquanto permite acesso mock (sem token) para desenvolvimento frontend puro.
// Quando Supabase estiver ativo, descomente a verificação.

const supabase = require('../config/supabase');

async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    // Modo mock: permite sem token
    req.user = { id: 'mock-user', role: req.headers['x-mock-role'] || 'admin', email: 'mock@resolutio.com' };
    return next();
  }
  const token = header.split(' ')[1];
  if (!supabase) {
    req.user = { id: 'mock-user', role: 'admin', email: 'mock@resolutio.com' };
    return next();
  }
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Token inválido' });
    // Buscar role na tabela usuarios
    const { data: perfil } = await supabase.from('usuarios').select('role').eq('id', data.user.id).single();
    req.user = { id: data.user.id, email: data.user.email, role: perfil?.role || 'cliente' };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Falha na autenticação', details: e.message });
  }
}

module.exports = auth;
