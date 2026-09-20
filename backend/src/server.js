require('dotenv').config();
const express = require('express');
const cors = require('cors');
const supabase = require('./config/supabase');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health
app.get('/health', (req, res) => {
  res.json({ ok: true, supabase: !!supabase, time: new Date().toISOString(), version: '1.0.0' });
});

// Mock DB (mesmo do frontend, para testes sem Supabase) — sem dados de demonstração
const mockDB = {
  leads: [],
  clientes: []
};

function useSupabase() { return !!supabase; }

// --- Leads ---
app.get('/api/leads', async (req, res) => {
  if (useSupabase()) {
    const { data, error } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  res.json(mockDB.leads);
});

app.post('/api/leads', async (req, res) => {
  const payload = req.body;
  if (!payload.nome) return res.status(400).json({ error: 'nome é obrigatório' });
  if (useSupabase()) {
    const { data, error } = await supabase.from('leads').insert(payload).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }
  const lead = { id: String(Date.now()), created_at: new Date().toISOString().slice(0,10), ...payload };
  mockDB.leads.unshift(lead);
  res.status(201).json(lead);
});

app.patch('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  if (useSupabase()) {
    const { data, error } = await supabase.from('leads').update(req.body).eq('id', id).select().single();
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  const idx = mockDB.leads.findIndex(l=>l.id===id);
  if(idx<0) return res.status(404).json({ error:'Lead não encontrado' });
  mockDB.leads[idx] = { ...mockDB.leads[idx], ...req.body };
  res.json(mockDB.leads[idx]);
});

app.delete('/api/leads/:id', async (req, res) => {
  const { id } = req.params;
  if (useSupabase()) {
    const { error } = await supabase.from('leads').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok:true });
  }
  mockDB.leads = mockDB.leads.filter(l=>l.id!==id);
  res.json({ ok:true });
});

// --- Clientes ---
app.get('/api/clientes', async (req, res) => {
  if (useSupabase()) {
    const { data, error } = await supabase.from('clientes').select('*, usuarios!inner(nome,email)').order('created_at', { ascending:false });
    if (error) return res.status(500).json({ error: error.message });
    return res.json(data);
  }
  res.json(mockDB.clientes);
});

// --- Outras rotas (placeholder — estrutura pronta para expandir) ---
app.get('/api/financeiro/resumo', (req, res) => {
  res.json({ recebido: 0, aReceber: 0, atrasado: 0, faturamentoPrevisto: 0 });
});

app.get('/api/contratos', async (req,res)=>{
  if(useSupabase()){
    const { data, error } = await supabase.from('contratos').select('*, clientes(nome)').order('created_at', {ascending:false});
    if(error) return res.status(500).json({error:error.message});
    return res.json(data);
  }
  res.json([]);
});

// Servir frontend estático (opcional)
const path = require('path');
app.use(express.static(path.join(__dirname, '../../frontend')));

// Fallback SPA
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Rota não encontrada' });
  res.sendFile(path.join(__dirname, '../../frontend/index.html'));
});

app.listen(PORT, () => {
  console.log(`✅ Resolutio backend rodando em http://localhost:${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Frontend: http://localhost:${PORT}/`);
  if (!supabase) console.log('   (modo mock — configure SUPABASE_URL e SUPABASE_ANON_KEY no .env para ativar o banco)');
});
