/* ==================== ESTADO ==================== */
let books = [
  {dbid:1, codigo:'BIB-0001', titulo:'Cien años de soledad', autor:'Gabriel García Márquez', categoria:'Literatura', editorial:'Sudamericana', anio:1967, ubicacion:'Estante A-1', estado:'Disponible', cantidad:3, disponibles:2, qr:null},
  {dbid:2, codigo:'BIB-0002', titulo:'El Principito', autor:'Antoine de Saint-Exupéry', categoria:'Literatura infantil', editorial:'Reynal & Hitchcock', anio:1943, ubicacion:'Estante B-2', estado:'Disponible', cantidad:4, disponibles:4, qr:null},
  {dbid:3, codigo:'BIB-0003', titulo:'Física para todos', autor:'Lev Landau', categoria:'Ciencia', editorial:'Mir', anio:1975, ubicacion:'Estante C-1', estado:'Prestado', cantidad:2, disponibles:0, qr:null},
];
let nextId = 4;
let editingId = null;

// Variables declaradas arriba para evitar errores de inicialización
let scanStream = null;
let scanRAF = null;
const qrSelect = document.getElementById('qrBookSelect');
const form = document.getElementById('bookForm');

/* ==================== UTIL ==================== */
function fmtDate(){
  const d = new Date();
  return d.toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'});
}

function genCode(){
  const n = String(nextId).padStart(4,'0');
  return 'BIB-'+n;
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

/* ==================== TABS ==================== */
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-'+btn.dataset.tab).classList.add('active');
    if(btn.dataset.tab === 'qr') refreshQrSelect();
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
      <p>Prueba otra búsqueda o agrega un nuevo título.</p>
    </div>`;
    renderStats();
    return;
  }

  grid.innerHTML = list.map(b=>{
    const badgeClass = b.estado === 'Disponible' ? 'ok' : 'warn';
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
      <div class="card-actions">
        <button type="button" class="btn secondary small" onclick="editBook(${b.dbid})">Editar</button>
        <button type="button" class="btn secondary small" onclick="goGenerateQr(${b.dbid})">Ver QR</button>
        <button type="button" class="btn danger small" onclick="deleteBook(${b.dbid})">Eliminar</button>
      </div>
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
  resetForm();
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

function deleteBook(id){
  if(!confirm('¿Eliminar este libro del catálogo?')) return;
  books = books.filter(b=>b.dbid!==id);
  renderCatalog();
}

on('btnCancelForm','click', ()=>{
  resetForm();
  switchToTab('catalogo');
});

form.addEventListener('submit', e=>{
  e.preventDefault();
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

  if(editingId){
    const b = books.find(x=>x.dbid===editingId);
    Object.assign(b, data);
    b.qr = null; // se regenera si cambió el código
  }else{
    books.push({dbid: nextId++, qr:null, ...data});
  }

  resetForm();
  renderCatalog();
  switchToTab('catalogo');
});

/* ==================== ESCANEAR QR ==================== */
on('btnStartScan','click', startScanner);
on('btnStopScan','click', stopScanner);

async function startScanner(){
  const video = document.getElementById('scanVideo');
  try{
    stopScanner();
    scanStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    video.srcObject = scanStream;
    await video.play();
    tickScanner();
  }catch(err){
    document.getElementById('scanResultBox').innerHTML =
      `<p style="color:var(--stamp);margin:0;">No se pudo acceder a la cámara. Verifica los permisos del navegador.</p>`;
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

function tickScanner(){
  const video = document.getElementById('scanVideo');
  if(!scanStream) return;
  if(video.readyState === video.HAVE_ENOUGH_DATA){
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0,0,canvas.width, canvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height);
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
      <button type="button" class="btn small" onclick="editBook(${b.dbid})">Abrir ficha</button>
      <button type="button" class="btn secondary small" onclick="startScanner()">Escanear otro</button>
    `;
  }else{
    box.classList.remove('found');
    box.innerHTML = `
      <p style="margin:0 0 6px;"><b>Código no registrado</b></p>
      <p class="code-value">${escapeHtml(text)}</p>
      <p style="margin:10px 0 12px;color:var(--muted);font-size:0.85rem;">Este código QR no coincide con ningún libro del catálogo.</p>
      <button type="button" class="btn small" id="btnCreateFromScan">Crear libro con este código</button>
      <button type="button" class="btn secondary small" onclick="startScanner()">Escanear otro</button>
    `;
    document.getElementById('btnCreateFromScan').addEventListener('click', ()=>createFromScan(text));
  }
}

function createFromScan(code){
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
  const file = e.target.files[0];
  if(!file) return;
  const status = document.getElementById('importStatus');
  const reader = new FileReader();
  reader.onload = evt=>{
    try{
      const wb = XLSX.read(evt.target.result, {type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1});
      let added = 0, updated = 0;
      for(let i=1;i<rows.length;i++){
        const r = rows[i];
        if(!r || !r[0]) continue;
        const data = {
          codigo:String(r[0]), titulo:r[1]||'', autor:r[2]||'', categoria:r[3]||'',
          editorial:r[4]||'', anio:r[5]||'', ubicacion:r[6]||'', estado:r[7]||'Disponible',
          cantidad:Number(r[8])||0, disponibles:Number(r[9])||0
        };
        const existing = books.find(b=>b.codigo===data.codigo);
        if(existing){ Object.assign(existing, data); existing.qr=null; updated++; }
        else { books.push({dbid: nextId++, qr:null, ...data}); added++; }
      }
      status.style.color = 'var(--ink)';
      status.textContent = `Importación completa: ${added} nuevos, ${updated} actualizados.`;
      renderCatalog();
    }catch(err){
      status.style.color = 'var(--stamp)';
      status.textContent = 'No se pudo leer el archivo. Verifica que sea un .xlsx exportado desde este sistema.';
    }
    e.target.value = '';
  };
  reader.readAsArrayBuffer(file);
});

/* ==================== INIT ==================== */
document.getElementById('dateStamp').textContent = fmtDate();
renderCatalog();
