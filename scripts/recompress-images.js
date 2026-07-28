#!/usr/bin/env node
// Recomprime as imagens já existentes de eventos e banners no Supabase Storage.
//
// Roda local, uma vez: node scripts/recompress-images.js
// Pede seu e-mail e senha de admin só aqui no terminal — nunca saem da sua
// máquina, servem apenas pra autenticar as chamadas ao Supabase (upload no
// Storage e update no banco exigem estar logado como membro do painel).
//
// Usa `sips` (nativo do macOS) pra redimensionar/recomprimir — sem instalar nada.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const SUPABASE_URL = 'https://ygbmjiosphwkwbvmgorm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlnYm1qaW9zcGh3a3didm1nb3JtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMTU1MzMsImV4cCI6MjA5ODU5MTUzM30.MWlbSeKa-pL4goeKmTzrANRMva6-GydkNPAyhjfHPI8';
const STORAGE_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/images/`;
const MAX_DIMENSION = 1600;
const QUALITY = 80;

function ask(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer) => { rl.close(); resolve(answer); });
  });
}

// Lê a senha sem ecoar na tela (compara por código de caractere pra evitar
// bytes de controle literais soltos no meio do arquivo-fonte).
function askHidden(prompt) {
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (char) => {
      const code = char.charCodeAt(0);
      const isEnter = code === 10 || code === 13; // \n ou \r
      const isEOF = code === 4;                   // Ctrl+D
      const isInterrupt = code === 3;              // Ctrl+C
      const isBackspace = code === 127 || code === 8;

      if (isEnter || isEOF) {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(value);
      } else if (isInterrupt) {
        process.exit(1);
      } else if (isBackspace) {
        value = value.slice(0, -1);
        process.stdout.write('\b \b');
      } else {
        value += char;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || 'Login falhou');
  return data.access_token;
}

function isOwnStorageUrl(url) {
  return typeof url === 'string' && url.startsWith(STORAGE_PREFIX);
}

function compressToJpeg(inputPath) {
  const outputPath = `${inputPath}.compressed.jpg`;
  const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', inputPath]).toString();
  const width = parseInt((info.match(/pixelWidth:\s*(\d+)/) || [])[1] || '0', 10);
  const height = parseInt((info.match(/pixelHeight:\s*(\d+)/) || [])[1] || '0', 10);

  const args = ['-s', 'format', 'jpeg', '-s', 'formatOptions', String(QUALITY)];
  if (Math.max(width, height) > MAX_DIMENSION) {
    args.push('--resampleHeightWidthMax', String(MAX_DIMENSION));
  }
  execFileSync('sips', [...args, inputPath, '--out', outputPath], { stdio: 'ignore' });
  return outputPath;
}

async function processUrl(label, url, accessToken) {
  if (!isOwnStorageUrl(url)) {
    console.log(`  (${label}: URL externa, pulando) ${url}`);
    return null;
  }
  const storagePath = url.slice(STORAGE_PREFIX.length);

  const res = await fetch(url);
  if (!res.ok) { console.warn(`  ! Falha ao baixar ${label}`); return null; }
  const buf = Buffer.from(await res.arrayBuffer());
  const originalSize = buf.length;

  const tmpIn = path.join(os.tmpdir(), `recompress_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  fs.writeFileSync(tmpIn, buf);

  let tmpOut;
  try {
    tmpOut = compressToJpeg(tmpIn);
  } catch (err) {
    console.warn(`  ! Falha ao comprimir ${label}:`, err.message);
    fs.unlinkSync(tmpIn);
    return null;
  }

  const compressedBuf = fs.readFileSync(tmpOut);
  fs.unlinkSync(tmpIn);
  fs.unlinkSync(tmpOut);

  if (compressedBuf.length >= originalSize) {
    console.log(`  = ${label}: já otimizada (${(originalSize / 1024).toFixed(0)} KiB), mantendo.`);
    return null;
  }

  const newPath = storagePath.replace(/\.\w+$/, '') + `_c${Date.now()}.jpg`;
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${newPath}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'image/jpeg'
    },
    body: compressedBuf
  });
  if (!uploadRes.ok) {
    console.warn(`  ! Falha ao subir versão comprimida de ${label}:`, await uploadRes.text());
    return null;
  }

  console.log(`  OK ${label}: ${(originalSize / 1024).toFixed(0)} KiB -> ${(compressedBuf.length / 1024).toFixed(0)} KiB`);

  try {
    await fetch(`${SUPABASE_URL}/storage/v1/object/images/${storagePath}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${accessToken}` }
    });
  } catch {
    // best-effort — arquivo antigo órfão não afeta o site
  }

  return `${STORAGE_PREFIX}${newPath}`;
}

async function updateRow(table, id, fields, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify(fields)
  });
  if (!res.ok) throw new Error(`Falha ao atualizar ${table} ${id}: ${await res.text()}`);
}

(async () => {
  console.log('Recompressão de imagens — Seu Promoter\n');
  const email = await ask('E-mail de admin: ');
  const password = await askHidden('Senha: ');

  console.log('\nEntrando...');
  const accessToken = await login(email, password);
  console.log('OK, autenticado.\n');

  const authHeaders = { apikey: SUPABASE_ANON, Authorization: `Bearer ${accessToken}` };

  const eventsRes = await fetch(`${SUPABASE_URL}/rest/v1/events?select=id,title,image_url,map_image_url`, { headers: authHeaders });
  if (!eventsRes.ok) throw new Error(`Falha ao listar eventos: ${await eventsRes.text()}`);
  const events = await eventsRes.json();

  const bannersRes = await fetch(`${SUPABASE_URL}/rest/v1/banners?select=id,title,desktop_image_url,mobile_image_url`, { headers: authHeaders });
  const banners = bannersRes.ok ? await bannersRes.json() : [];

  for (const ev of events) {
    console.log(`Evento: ${ev.title}`);
    const updates = {};
    if (ev.image_url) {
      const newUrl = await processUrl('imagem', ev.image_url, accessToken);
      if (newUrl) updates.image_url = newUrl;
    }
    if (ev.map_image_url) {
      const newUrl = await processUrl('mapa', ev.map_image_url, accessToken);
      if (newUrl) updates.map_image_url = newUrl;
    }
    if (Object.keys(updates).length) {
      await updateRow('events', ev.id, updates, accessToken);
      console.log('  Banco atualizado.');
    }
  }

  for (const b of banners) {
    console.log(`Banner: ${b.title || b.id}`);
    const updates = {};
    if (b.desktop_image_url) {
      const newUrl = await processUrl('desktop', b.desktop_image_url, accessToken);
      if (newUrl) updates.desktop_image_url = newUrl;
    }
    if (b.mobile_image_url) {
      const newUrl = await processUrl('mobile', b.mobile_image_url, accessToken);
      if (newUrl) updates.mobile_image_url = newUrl;
    }
    if (Object.keys(updates).length) {
      await updateRow('banners', b.id, updates, accessToken);
      console.log('  Banco atualizado.');
    }
  }

  console.log('\nConcluído!');
})().catch((err) => {
  console.error('\nErro:', err.message);
  process.exit(1);
});
