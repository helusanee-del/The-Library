/* ==================== SUPABASE ==================== */
const SUPABASE_URL = 'https://rxiofhsdjydktbbqtgdz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ4aW9maHNkanlka3RiYnF0Z2R6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNzgwNDUsImV4cCI6MjEwNTc1NDA0NX0.ivBKGket7O1gfQizK5nmFYQZRIb3CnuBc4YwicDaKzo';
const TABLE = 'libros';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ==================== ESTADO ==================== */
let books = [];
let editingId = null;

let perfil = null;          // { id, email, rol } del usuario con sesión abierta
let loadedUserId = null;    // evita recargar todo cuando solo se renueva el token
let authMode = 'login';     // 'login' | 'signup'

let scanStream = null;
let scanRAF = null;
const qrSelect = document.getElementById('qrBookSelect');
const form = document.getElementById('bookForm');

/* ==================== UTIL ==================== */
function fmtDate(){
  const d = new Date();
  return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});
}

// Siguiente código BIB-XXXX según el mayor existente
function genCode(){
  let max = 0;
  books.forEach(b=>{
    const m = /^BIB-(\d+)$/.exec(b.codigo);
    if(m) max = Math.max(max, Number(m[1]));
  });
  return 'BIB-' + String(max + 1).padStart(4,'0');
}

function makeQrDataUrl(text, cb){
  const holder = document.createElement('div');
  holder.style.display='none';
  document.body.appendChild(holder);
  new QRCode(holder, {text:text, width:180, height:180, correctLevel:QRCode.CorrectLevel.M});
  setTimeout(()=>{
    let url = '';
    const img = holder.querySelector('img');
    const canvas = holder.querySelector('canvas');
    if(canvas) url = canvas.toDataURL('image/png');
    else if(img) url = img.src;
    document.body.removeChild(holder);
    cb(url);
  }, 60);
}

function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function on(id, evt, fn){
  const el = document.getElementById(id);
  if(el) el.addEventListener(evt, fn);
}

function isAdmin(){
  return !!perfil && perfil.rol === 'admin';
}

// Puerta para las acciones de escritura. La seguridad de verdad la aplica
// Supabase con RLS; esto solo evita que el usuario choque contra un error.
function soloAdmin(){
  if(isAdmin()) return true;
  alert('Solo el administrador puede modificar el catálogo.');
  return false;
}

function toast(msg, isError){
  const el = document.getElementById('dateStamp');
  console[isError?'error':'log'](msg);
  if(isError) alert(msg);
}

// Fila de Supabase -> objeto de la página
function fromRow(r){
  return {
    dbid: r.id, codigo: r.codigo, titulo: r.titulo, autor: r.autor,
    categoria: r.categoria||'', editorial: r.editorial||'',
    anio: r.anio==null ? '' : r.anio, ubicacion: r.ubicacion||'',
    estado: r.estado||'Disponible', cantidad: r.cantidad||0, disponibles: r.disponibles||0,
    qr: null
  };
}

// Objeto de la página -> fila de Supabase
function toRow(d){
  const anio = parseInt(d.anio, 10);
  return {
    codigo: d.codigo, titulo: d.titulo, autor: d.autor,
    categoria: d.categoria || null, editorial: d.editorial || null,
    anio: isNaN(anio) ? null : anio, ubicacion: d.ubicacion || null,
    estado: d.estado || 'Disponible',
    cantidad: Number(d.cantidad)||0, disponibles: Number(d.disponibles)||0
  };
}

async function loadBooks(){
  const grid = document.getElementById('catalogGrid');
  grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="big">Cargando catálogo…</div></div>`;
  const { data, error } = await db.from(TABLE).select('*').order('codigo', {ascending:true});
  if(error){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="big">No se pudo conectar con Supabase</div>
      <p>${escapeHtml(error.message)}</p>
      <p>Verifica que la tabla "${TABLE}" exista y que las políticas (RLS) permitan el acceso.</p></div>`;
    return;
  }
  books = data.map(fromRow);
  renderCatalog();
}

/* ==================== TABS ==================== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'qr') refreshQrSelect();
    if(btn.dataset.tab === 'usuarios') loadUsuarios();
    if(btn.dataset.tab !== 'scan') stopScanner();
  });
});

function switchToTab(name){
  document.querySelector(`.tab-btn[data-tab="${name}"]`).click();
}

/* ==================== RENDER CATALOGO ==================== */
function renderStats(){
  const total = books.length;
  const copias = books.reduce((a,b)=>a+Number(b.cantidad||0),0);
  const disp = books.reduce((a,b)=>a+Number(b.disponibles||0),0);
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statCopias').textContent = copias;
  document.getElementById('statDisp').textContent = disp;
  document.getElementById('statPrestado').textContent = Math.max(copias-disp,0);
}

function renderCatalog(){
  const grid = document.getElementById('catalogGrid');
  const term = document.getElementById('searchInput').value.trim().toLowerCase();
  const estadoFilter = document.getElementById('filterEstado').value;

  let list = books.filter(b=>{
    const matchTerm = !term || (b.titulo+' '+b.autor+' '+b.codigo).toLowerCase().includes(term);
    const matchEstado = !estadoFilter || b.estado === estadoFilter;
    return matchTerm && matchEstado;
  });

  if(list.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <div class="big">No hay libros que coincidan</div>
      <p>${isAdmin() ? 'Prueba otra búsqueda o agrega un nuevo título.' : 'Prueba con otra búsqueda.'}</p>
    </div>`;
    renderStats();
    return;
  }

  const admin = isAdmin();

  grid.innerHTML = list.map(b=>{
    const badgeClass = b.estado === 'Disponible' ? 'ok' : 'warn';
    // El rol de consulta solo puede ver el QR.
    const acciones = admin
      ? `<button type="button" class="btn secondary small" onclick="editBook(${b.dbid})">Editar</button>
        <button type="button" class="btn secondary small" onclick="goGenerateQr(${b.dbid})">Ver QR</button>
        <button type="button" class="btn danger small" onclick="deleteBook(${b.dbid})">Eliminar</button>`
      : `<button type="button" class="btn secondary small" onclick="goGenerateQr(${b.dbid})">Ver QR</button>`;
    return `
    <div class="book-card" data-id="${b.dbid}">
      <div class="top-row">
        <div>
          <p class="titulo">${escapeHtml(b.titulo)}</p>
          <p class="autor">${escapeHtml(b.autor)}</p>
        </div>
        <div class="qr-thumb" id="thumb-${b.dbid}"></div>
      </div>
      <div class="book-meta">
        <div><b>Código</b> ${escapeHtml(b.codigo)}</div>
        <div><b>Categoría</b> ${escapeHtml(b.categoria||'—')}</div>
        <div><b>Ubicación</b> ${escapeHtml(b.ubicacion||'—')}</div>
        <div><b>Ejemplares</b> ${b.disponibles} / ${b.cantidad} <span class="badge ${badgeClass}">${escapeHtml(b.estado)}</span></div>
      </div>
      <div class="card-actions">${acciones}</div>
    </div>`;
  }).join('');

  list.forEach(b=>{
    const thumb = document.getElementById('thumb-'+b.dbid);
    if(b.qr){
      thumb.innerHTML = `<img src="${b.qr}" alt="QR ${escapeHtml(b.codigo)}">`;
    }else{
      makeQrDataUrl(b.codigo, url=>{
        b.qr = url;
        const t = document.getElementById('thumb-'+b.dbid);
        if(t) t.innerHTML = `<img src="${url}" alt="QR ${escapeHtml(b.codigo)}">`;
      });
    }
  });

  renderStats();
}

on('searchInput','input', renderCatalog);
on('filterEstado','change', renderCatalog);

/* ==================== FORM CRUD ==================== */
on('btnNuevoLibro','click', ()=>{
  if(!soloAdmin()) return;
  resetForm();
  document.getElementById('f_codigo').value = genCode();
  switchToTab('form');
});

on('btnAutoCode','click', ()=>{
  document.getElementById('f_codigo').value = genCode();
});

function resetForm(){
  editingId = null;
  form.reset();
  document.getElementById('f_dbid').value = '';
  document.getElementById('f_cantidad').value = 1;
  document.getElementById('f_disponibles').value = 1;
  document.getElementById('formTitle').textContent = 'Nuevo libro';
}

function editBook(id){
  if(!soloAdmin()) return;
  const b = books.find(x=>x.dbid===id);
  if(!b) return;
  editingId = id;
  document.getElementById('f_dbid').value = b.dbid;
  document.getElementById('f_codigo').value = b.codigo;
  document.getElementById('f_titulo').value = b.titulo;
  document.getElementById('f_autor').value = b.autor;
  document.getElementById('f_categoria').value = b.categoria||'';
  document.getElementById('f_editorial').value = b.editorial||'';
  document.getElementById('f_anio').value = b.anio||'';
  document.getElementById('f_ubicacion').value = b.ubicacion||'';
  document.getElementById('f_estado').value = b.estado;
  document.getElementById('f_cantidad').value = b.cantidad;
  document.getElementById('f_disponibles').value = b.disponibles;
  document.getElementById('formTitle').textContent = 'Editar libro';
  switchToTab('form');
}

async function deleteBook(id){
  if(!soloAdmin()) return;
  if(!confirm('¿Eliminar este libro del catálogo?')) return;
  const { error } = await db.from(TABLE).delete().eq('id', id);
  if(error){ toast('No se pudo eliminar: '+error.message, true); return; }
  books = books.filter(b=>b.dbid!==id);
  renderCatalog();
}

on('btnCancelForm','click', ()=>{
  resetForm();
  switchToTab('catalogo');
});

form.addEventListener('submit', async e=>{
  e.preventDefault();
  if(!soloAdmin()) return;
  const codigo = document.getElementById('f_codigo').value.trim();
  if(!codigo){ alert('El código es obligatorio.'); return; }

  const dup = books.find(b=>b.codigo===codigo && b.dbid!==editingId);
  if(dup){ alert('Ya existe un libro con ese código.'); return; }

  const data = {
    codigo,
    titulo: document.getElementById('f_titulo').value.trim(),
    autor: document.getElementById('f_autor').value.trim(),
    categoria: document.getElementById('f_categoria').value.trim(),
    editorial: document.getElementById('f_editorial').value.trim(),
    anio: document.getElementById('f_anio').value,
    ubicacion: document.getElementById('f_ubicacion').value.trim(),
    estado: document.getElementById('f_estado').value,
    cantidad: Number(document.getElementById('f_cantidad').value)||0,
    disponibles: Number(document.getElementById('f_disponibles').value)||0,
  };

  const submitBtn = form.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  try{
    if(editingId){
      const { data: rows, error } = await db.from(TABLE).update(toRow(data)).eq('id', editingId).select();
      if(error) throw error;
      const b = books.find(x=>x.dbid===editingId);
      Object.assign(b, fromRow(rows[0]));
    }else{
      const { data: rows, error } = await db.from(TABLE).insert(toRow(data)).select();
      if(error) throw error;
      books.push(fromRow(rows[0]));
      books.sort((a,b)=>a.codigo.localeCompare(b.codigo));
    }
    resetForm();
    renderCatalog();
    switchToTab('catalogo');
  }catch(err){
    toast('No se pudo guardar: '+err.message, true);
  }finally{
    submitBtn.disabled = false;
  }
});

/* ==================== ESCANEAR QR ==================== */
on('btnStartScan','click', startScanner);
on('btnStopScan','click', stopScanner);

function scanMsg(html, isError){
  const box = document.getElementById('scanResultBox');
  box.classList.remove('found');
  box.innerHTML = `<p style="color:${isError?'var(--stamp)':'var(--muted)'};margin:0;">${html}</p>`;
}

async function startScanner(){
  const video = document.getElementById('scanVideo');

  if(!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    scanMsg('La cámara solo funciona si la página se abre con <b>https://</b> o desde <b>localhost</b>. Si abriste el archivo directamente (file://) o con una IP http://, el navegador bloquea la cámara. Publica la página (GitHub Pages, Netlify, Vercel) o ábrela con un servidor local.', true);
    return;
  }

  if(typeof jsQR === 'undefined'){
    scanMsg('No se cargó la librería que lee códigos QR (jsQR). Revisa tu conexión a internet y recarga la página con Ctrl+F5.', true);
    return;
  }

  try{
    stopScanner();
    scanMsg('Activando cámara…');
    try{
      scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}}, audio:false});
    }catch(e1){
      if(e1.name === 'NotAllowedError' || e1.name === 'SecurityError') throw e1;
      // En computadores sin cámara trasera: usar cualquier cámara disponible
      scanStream = await navigator.mediaDevices.getUserMedia({video:true, audio:false});
    }
    video.muted = true;
    video.setAttribute('playsinline','');
    video.srcObject = scanStream;
    await video.play();
    scanMsg('Cámara activa. Apunta al código QR del libro…');
    tickScanner();
  }catch(err){
    stopScanner();
    let msg;
    switch(err.name){
      case 'NotAllowedError':
      case 'SecurityError':
        msg = 'Permiso de cámara denegado. Toca el candado junto a la dirección de la página, permite la cámara y pulsa "Activar cámara" de nuevo.'; break;
      case 'NotFoundError':
      case 'OverconstrainedError':
        msg = 'No se encontró ninguna cámara en este dispositivo.'; break;
      case 'NotReadableError':
      case 'AbortError':
        msg = 'La cámara está siendo usada por otra aplicación o pestaña. Ciérrala e inténtalo otra vez.'; break;
      default:
        msg = 'No se pudo iniciar la cámara: ' + escapeHtml(err.message || err.name);
    }
    scanMsg(msg, true);
  }
}

function stopScanner(){
  if(scanRAF) cancelAnimationFrame(scanRAF);
  scanRAF = null;
  if(scanStream){
    scanStream.getTracks().forEach(t=>t.stop());
    scanStream = null;
  }
}

const scanCanvas = document.createElement('canvas');
const scanCtx = scanCanvas.getContext('2d', {willReadFrequently:true});

function tickScanner(){
  const video = document.getElementById('scanVideo');
  if(!scanStream) return;
  if(video.readyState === video.HAVE_ENOUGH_DATA && video.videoWidth > 0){
    // Reducir la imagen para que el análisis sea rápido
    const scale = Math.min(1, 640 / video.videoWidth);
    scanCanvas.width = Math.round(video.videoWidth * scale);
    scanCanvas.height = Math.round(video.videoHeight * scale);
    scanCtx.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
    const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, {inversionAttempts:'attemptBoth'});
    if(code && code.data){
      handleScanResult(code.data);
      stopScanner();
      return;
    }
  }
  scanRAF = requestAnimationFrame(tickScanner);
}

function handleScanResult(text){
  const box = document.getElementById('scanResultBox');
  const b = books.find(x=>x.codigo === text);
  if(b){
    box.classList.add('found');
    box.innerHTML = `
      <p style="margin:0 0 6px;"><b>Libro encontrado</b></p>
      <p class="code-value">${escapeHtml(text)}</p>
      <p style="margin:10px 0 2px;font-family:'Fraunces',serif;font-size:1.05rem;">${escapeHtml(b.titulo)}</p>
      <p style="margin:0 0 12px;color:var(--muted);font-size:0.85rem;">${escapeHtml(b.autor)} — ${b.disponibles}/${b.cantidad} disponibles</p>
      ${isAdmin() ? `<button type="button" class="btn small" onclick="editBook(${b.dbid})">Abrir ficha</button>` : ''}
      <button type="button" class="btn secondary small" onclick="startScanner()">Escanear otro</button>
    `;
  }else{
    box.classList.remove('found');
    box.innerHTML = `
      <p style="margin:0 0 6px;"><b>Código no registrado</b></p>
      <p class="code-value">${escapeHtml(text)}</p>
      <p style="margin:10px 0 12px;color:var(--muted);font-size:0.85rem;">Este código QR no coincide con ningún libro del catálogo.</p>
      ${isAdmin() ? `<button type="button" class="btn small" id="btnCreateFromScan">Crear libro con este código</button>` : ''}
      <button type="button" class="btn secondary small" onclick="startScanner()">Escanear otro</button>
    `;
    on('btnCreateFromScan','click', ()=>createFromScan(text));
  }
}

function createFromScan(code){
  if(!soloAdmin()) return;
  resetForm();
  document.getElementById('f_codigo').value = code;
  switchToTab('form');
}

/* ==================== GENERAR QR ==================== */
function refreshQrSelect(){
  const current = qrSelect.value;
  qrSelect.innerHTML = '<option value="">Selecciona un libro del catálogo...</option>' +
    books.map(b=>`<option value="${b.dbid}">${escapeHtml(b.titulo)} — ${escapeHtml(b.codigo)}</option>`).join('');
  qrSelect.value = current;
}

qrSelect.addEventListener('change', ()=>{
  const id = Number(qrSelect.value);
  const b = books.find(x=>x.dbid===id);
  const box = document.getElementById('qrGenBox');
  const cap = document.getElementById('qrGenCaption');
  box.innerHTML = '';
  if(!b){ cap.textContent = 'Sin libro seleccionado'; return; }
  new QRCode(box, {text:b.codigo, width:160, height:160, correctLevel:QRCode.CorrectLevel.M});
  cap.textContent = b.codigo + ' — ' + b.titulo;
});

function goGenerateQr(id){
  switchToTab('qr');
  refreshQrSelect();
  qrSelect.value = id;
  qrSelect.dispatchEvent(new Event('change'));
}

on('btnDownloadQr','click', ()=>{
  const id = Number(qrSelect.value);
  const b = books.find(x=>x.dbid===id);
  if(!b){ alert('Selecciona primero un libro.'); return; }
  const box = document.getElementById('qrGenBox');
  const canvas = box.querySelector('canvas');
  const img = box.querySelector('img');
  const dataUrl = canvas ? canvas.toDataURL('image/png') : (img ? img.src : null);
  if(!dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `QR_${b.codigo}.png`;
  a.click();
});

/* ==================== EXCEL ==================== */
const EXCEL_HEADERS = ['Código','Título','Autor','Categoría','Editorial','Año','Ubicación','Estado','Cantidad','Disponibles'];

on('btnExportExcel','click', ()=>{
  const rows = [EXCEL_HEADERS, ...books.map(b=>[
    b.codigo, b.titulo, b.autor, b.categoria, b.editorial, b.anio, b.ubicacion, b.estado, b.cantidad, b.disponibles
  ])];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:30},{wch:22},{wch:16},{wch:16},{wch:8},{wch:14},{wch:14},{wch:10},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Catálogo');
  const fecha = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `biblioteca_catalogo_${fecha}.xlsx`);
});

on('excelFileInput','change', e=>{
  const input = e.target;
  const file = input.files[0];
  if(!file) return;
  if(!soloAdmin()){ input.value = ''; return; }
  const status = document.getElementById('importStatus');
  const reader = new FileReader();
  reader.onload = async evt=>{
    try{
      const wb = XLSX.read(evt.target.result, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1});

      const byCode = new Map();
      for(let i=1;i<rows.length;i++){
        const r = rows[i];
        if(!r || !r[0]) continue;
        const codigo = String(r[0]).trim();
        byCode.set(codigo, toRow({
          codigo, titulo:r[1]||'(sin título)', autor:r[2]||'(sin autor)', categoria:r[3]||'',
          editorial:r[4]||'', anio:r[5]||'', ubicacion:r[6]||'', estado:r[7]||'Disponible',
          cantidad:r[8], disponibles:r[9]
        }));
      }
      const payload = [...byCode.values()];
      if(payload.length === 0){
        status.style.color = 'var(--stamp)';
        status.textContent = 'El archivo no tiene filas para importar.';
        return;
      }

      const existingCodes = new Set(books.map(b=>b.codigo));
      const updated = payload.filter(p=>existingCodes.has(p.codigo)).length;
      const added = payload.length - updated;

      status.style.color = 'var(--ink)';
      status.textContent = 'Importando…';
      const { error } = await db.from(TABLE).upsert(payload, {onConflict:'codigo'});
      if(error) throw error;

      status.textContent = `Importación completa: ${added} nuevos, ${updated} actualizados.`;
      await loadBooks();
    }catch(err){
      status.style.color = 'var(--stamp)';
      status.textContent = 'No se pudo importar: ' + (err.message || 'verifica que sea un .xlsx exportado desde este sistema.');
    }finally{
      input.value = '';
    }
  };
  reader.readAsArrayBuffer(file);
});

/* ==================== USUARIOS (solo admin) ==================== */
let usuarios = [];

async function loadUsuarios(){
  const wrap = document.getElementById('usersWrap');
  if(!isAdmin()){ wrap.innerHTML = ''; return; }

  wrap.innerHTML = `<div class="empty-state"><div class="big">Cargando usuarios…</div></div>`;
  // La política "perfiles: ver el propio" deja que un admin vea todas las filas.
  const { data, error } = await db.from('perfiles')
    .select('id,email,rol,created_at')
    .order('created_at', {ascending:true});

  if(error){
    wrap.innerHTML = `<div class="empty-state">
      <div class="big">No se pudo leer la lista de usuarios</div>
      <p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  usuarios = data || [];
  renderUsuarios();
}

function renderUsuarios(){
  const wrap = document.getElementById('usersWrap');
  const term = document.getElementById('userSearch').value.trim().toLowerCase();
  const list = usuarios.filter(u=> !term || String(u.email||'').toLowerCase().includes(term));
  const admins = usuarios.filter(u=>u.rol==='admin').length;

  if(list.length === 0){
    wrap.innerHTML = `<div class="empty-state">
      <div class="big">${usuarios.length ? 'Ningún correo coincide' : 'Todavía no hay usuarios'}</div>
      <p>${usuarios.length ? 'Prueba con otra búsqueda.' : 'Se registran desde la pantalla de inicio de sesión.'}</p></div>`;
    return;
  }

  wrap.innerHTML = `
  <p class="users-count">${usuarios.length} registrado(s) · ${admins} administrador(es)</p>
  <div class="users-scroll">
  <table class="users-table">
    <thead><tr><th>Correo</th><th>Rol</th><th>Registrado</th><th>Acción</th></tr></thead>
    <tbody>
    ${list.map(u=>{
      const esAdmin = u.rol === 'admin';
      const soyYo = perfil && u.id === perfil.id;
      const fecha = u.created_at
        ? new Date(u.created_at).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'})
        : '—';
      return `<tr>
        <td class="u-mail">${escapeHtml(u.email||'—')}${soyYo ? '<span class="u-you">tú</span>' : ''}</td>
        <td><span class="role-badge ${esAdmin?'admin':''}">${esAdmin?'Administrador':'Consulta'}</span></td>
        <td class="u-date">${escapeHtml(fecha)}</td>
        <td><button type="button" class="btn ${esAdmin?'danger':''} small"
            onclick="cambiarRol('${u.id}','${esAdmin?'usuario':'admin'}')">
            ${esAdmin?'Quitar admin':'Hacer admin'}</button></td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>
  </div>`;
}

async function cambiarRol(id, nuevoRol){
  if(!soloAdmin()) return;
  const u = usuarios.find(x=>x.id===id);
  if(!u) return;

  // Sin ningún admin, recuperar el control exigiría volver al SQL Editor.
  if(nuevoRol === 'usuario' && usuarios.filter(x=>x.rol==='admin').length <= 1){
    alert('No puedes quitar el último administrador: nadie podría volver a administrar el catálogo. Asciende a otro usuario primero.');
    return;
  }

  const soyYo = perfil && id === perfil.id;
  const aviso = (soyYo && nuevoRol === 'usuario')
    ? 'Vas a quitarte el rol de administrador A TI MISMO. Perderás el acceso de edición. ¿Continuar?'
    : `¿Cambiar el rol de ${u.email} a ${nuevoRol === 'admin' ? 'administrador' : 'consulta'}?`;
  if(!confirm(aviso)) return;

  const { data, error } = await db.from('perfiles').update({rol:nuevoRol}).eq('id', id).select();
  if(error){ alert('No se pudo cambiar el rol: ' + error.message); return; }
  // Sin error pero sin filas: RLS dejó pasar la consulta y no actualizó nada.
  if(!data || data.length === 0){
    alert('La base de datos no aplicó el cambio. Comprueba que tu cuenta siga siendo administradora.');
    await loadUsuarios();
    return;
  }

  u.rol = nuevoRol;
  renderUsuarios();

  // Si me cambié a mí mismo, la interfaz debe reflejar el rol nuevo ya
  if(soyYo){
    perfil.rol = nuevoRol;
    applyRoleUI();
    renderCatalog();
  }
}

on('userSearch','input', renderUsuarios);
on('btnReloadUsers','click', loadUsuarios);

/* ==================== LOGIN Y ROLES ==================== */
const authGate   = document.getElementById('authGate');
const appShell   = document.getElementById('appShell');
const authForm   = document.getElementById('authForm');
const authSubmit = document.getElementById('authSubmit');

function authMsg(text, kind){
  const box = document.getElementById('authMsg');
  if(!text){ box.hidden = true; box.textContent = ''; return; }
  box.hidden = false;
  box.className = 'auth-msg ' + (kind || 'info');
  box.textContent = text;
}

// Alterna el formulario entre "Entrar" y "Crear cuenta"
function setAuthMode(mode){
  authMode = mode;
  const signup = mode === 'signup';
  document.getElementById('authSub').textContent = signup
    ? 'Crea tu cuenta. Entrarás con permiso de consulta hasta que un administrador cambie tu rol.'
    : 'Inicia sesión para consultar el catálogo de la biblioteca.';
  authSubmit.textContent = signup ? 'Crear cuenta' : 'Entrar';
  document.getElementById('authSwitchText').textContent = signup ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?';
  document.getElementById('btnAuthSwitch').textContent = signup ? 'Entrar' : 'Crear una';
  document.getElementById('authPass').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  authMsg('');
}

on('btnAuthSwitch','click', ()=> setAuthMode(authMode === 'login' ? 'signup' : 'login'));

// Los mensajes de Supabase Auth llegan en inglés y muy genéricos
function textoAuthError(err){
  const m = String(err && err.message || '').toLowerCase();
  if(m.includes('invalid login credentials')) return 'Correo o contraseña incorrectos.';
  if(m.includes('email not confirmed'))       return 'Todavía no confirmaste tu correo. Abre el enlace que te envió Supabase.';
  if(m.includes('already registered'))        return 'Ese correo ya tiene cuenta. Usa "Entrar".';
  if(m.includes('password'))                  return 'La contraseña debe tener al menos 6 caracteres.';
  // Supabase limita los correos de confirmación a unos pocos por hora.
  // No es un límite de intentos: es la cuota de envío de emails.
  if(m.includes('email rate limit') || m.includes('over_email_send_rate'))
    return 'Supabase alcanzó su límite de correos por hora (no es tu contraseña). Desactiva "Confirm email" en Authentication → Providers → Email, o espera una hora.';
  if(m.includes('you can only request this after'))
    return 'Espera unos segundos antes de volver a intentarlo: Supabase limita las peticiones seguidas.';
  if(m.includes('rate limit') || m.includes('too many'))
    return 'Demasiadas peticiones seguidas. Espera un momento y vuelve a probar.';
  if(m.includes('failed to fetch'))           return 'Sin conexión con Supabase. Revisa tu internet.';
  return (err && err.message) || 'No se pudo completar la operación.';
}

authForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPass').value;

  authSubmit.disabled = true;
  authMsg(authMode === 'signup' ? 'Creando cuenta…' : 'Entrando…', 'info');
  try{
    if(authMode === 'signup'){
      const { data, error } = await db.auth.signUp({ email, password });
      if(error) throw error;
      // Si el proyecto exige confirmar el correo, aún no hay sesión.
      if(!data.session){
        setAuthMode('login');
        authMsg('Cuenta creada. Confirma tu correo y luego inicia sesión.', 'ok');
        return;
      }
    }else{
      const { error } = await db.auth.signInWithPassword({ email, password });
      if(error) throw error;
    }
    document.getElementById('authPass').value = '';
    // onAuthStateChange se encarga de abrir la aplicación.
  }catch(err){
    authMsg(textoAuthError(err), 'error');
  }finally{
    authSubmit.disabled = false;
  }
});

on('btnLogout','click', async ()=>{
  stopScanner();
  await db.auth.signOut();
});

async function loadPerfil(user){
  const { data, error } = await db.from('perfiles').select('id,email,rol').eq('id', user.id).maybeSingle();
  if(error) console.error('No se pudo leer el perfil:', error.message);
  // Sin fila de perfil (por ejemplo si falta el trigger) se asume el rol más
  // restrictivo: escribir fallaría igualmente en las políticas RLS.
  perfil = data || { id:user.id, email:user.email, rol:'usuario' };
  if(!perfil.email) perfil.email = user.email;
}

function applyRoleUI(){
  const admin = isAdmin();
  document.querySelectorAll('[data-admin-only]').forEach(el=>{ el.hidden = !admin; });
  document.getElementById('readonlyNote').hidden = admin;
  document.getElementById('userMail').textContent = perfil.email || '';
  const badge = document.getElementById('roleBadge');
  badge.textContent = admin ? 'Administrador' : 'Consulta';
  badge.classList.toggle('admin', admin);
  // Si quedó abierta una pestaña de admin (sesión anterior, o acaba de
  // quitarse el rol a sí mismo), devolver al catálogo.
  if(!admin){
    const activa = document.querySelector('.panel.active');
    const tab = activa && activa.id.replace('panel-','');
    const btn = tab && document.querySelector(`.tab-btn[data-tab="${tab}"]`);
    if(btn && btn.hasAttribute('data-admin-only')) switchToTab('catalogo');
  }
}

function showGate(){
  appShell.hidden = true;
  authGate.hidden = false;
  authGate.classList.remove('booting');
  books = [];
  usuarios = [];
  perfil = null;
  stopScanner();
  document.getElementById('authPass').value = '';
}

async function showApp(){
  authGate.hidden = true;
  authGate.classList.remove('booting');
  appShell.hidden = false;
  applyRoleUI();
  await loadBooks();
}

async function handleSession(session){
  if(!session){
    loadedUserId = null;
    showGate();
    return;
  }
  // El mismo usuario vuelve a notificar al renovarse el token: no recargues.
  if(loadedUserId === session.user.id) return;
  loadedUserId = session.user.id;
  await loadPerfil(session.user);
  await showApp();
}

// supabase-js se bloquea si se hace await de otra llamada suya dentro del
// listener, así que el trabajo se saca del callback.
db.auth.onAuthStateChange((_event, session)=>{
  setTimeout(()=>handleSession(session), 0);
});

/* ==================== INIT ==================== */
document.getElementById('dateStamp').textContent = fmtDate();
setAuthMode('login');

// Si quedó una sesión guardada en el navegador, entra directo al catálogo.
db.auth.getSession().then(({ data })=> handleSession(data.session));
