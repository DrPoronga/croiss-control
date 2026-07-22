// PRECARGA DE LA IMAGEN EN MEMORIA RAM
const croissImagePreload = new Image();
croissImagePreload.src = '/static/croissant.png';

// Configuracion de fechas iniciales
const hoy = new Date().toISOString().split('T')[0];
if(document.getElementById('vFecha')) document.getElementById('vFecha').value = hoy;
if(document.getElementById('vFechaEntrega')) document.getElementById('vFechaEntrega').value = hoy;
if(document.getElementById('gFecha')) document.getElementById('gFecha').value = hoy;

if(document.getElementById('bMesFilter')) document.getElementById('bMesFilter').value = hoy.substring(0, 7);
if(document.getElementById('cMesFilter')) document.getElementById('cMesFilter').value = hoy.substring(0, 7);

let catalogoProductos = [];
let carrito = [];
let datosClientesGlobal = { todos: [], ranking: [], subOrigen: 'lista' };
let directorioClientesCache = [];
let isFetchingStock = false;
let clienteUltimoAutocompletado = '';
let croissAnimFrameId = null;
let agendaGlobalData = [];
let clienteDetalleActual = null;
let itemsEdicionTemp = [];

// Garantiza ver la secuencia completa de la animacion
async function esperarAnimacionMinima(tiempoInicio, minMs = 2200) {
    const transcurrido = Date.now() - tiempoInicio;
    if (transcurrido < minMs) {
        await new Promise(resolve => setTimeout(resolve, minMs - transcurrido));
    }
}

// Helper seguro para leer valores de inputs
function getInputValueSafe(id, defaultVal = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : defaultVal;
}

// LOADER CANVAS
function mostrarCroissLoader() {
    Swal.fire({
        html: `
            <div class="croiss-canvas-container">
                <canvas id="croissBiteCanvas" width="180" height="140"></canvas>
            </div>
        `,
        showConfirmButton: false,
        allowOutsideClick: false,
        background: 'transparent',
        customClass: {
            popup: 'croiss-swal-popup-transparent'
        },
        didOpen: () => {
            iniciarAnimacionCanvasCroissant();
        },
        willClose: () => {
            if (croissAnimFrameId) cancelAnimationFrame(croissAnimFrameId);
        }
    });
}

function iniciarAnimacionCanvasCroissant() {
    const canvas = document.getElementById('croissBiteCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const startTime = Date.now();
    const duration = 2200;

    const bites = [
        { t: 0.15, x: 145, y: 38, r: 22, shake: 'chomp-shake-1' },
        { t: 0.35, x: 122, y: 50, r: 26, shake: 'chomp-shake-2' },
        { t: 0.55, x: 92,  y: 68, r: 30, shake: 'chomp-shake-3' },
        { t: 0.75, x: 60,  y: 84, r: 28, shake: 'chomp-shake-4' },
        { t: 0.90, x: 28,  y: 98, r: 38, shake: 'chomp-shake-5' }
    ];

    function recortarMordidaDentadura(cx, cy, radius) {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();

        const numTeeth = 5;
        for (let i = 0; i < numTeeth; i++) {
            const angle = (Math.PI / 3) + (i * (Math.PI / 4.2));
            const tx = cx + Math.cos(angle) * (radius - 2);
            const ty = cy + Math.sin(angle) * (radius - 2);
            ctx.beginPath();
            ctx.arc(tx, ty, radius * 0.28, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function render() {
        const elapsed = (Date.now() - startTime) % duration;
        const progress = elapsed / duration;

        ctx.globalCompositeOperation = 'source-over';
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (croissImagePreload.complete && croissImagePreload.naturalWidth !== 0) {
            ctx.drawImage(croissImagePreload, 10, 10, 160, 120);

            let currentShake = '';
            for (let b of bites) {
                if (progress >= b.t) {
                    recortarMordidaDentadura(b.x, b.y, b.r);
                    if (progress >= b.t && progress < b.t + 0.10) {
                        currentShake = b.shake;
                    }
                }
            }

            canvas.className = currentShake;
        }

        croissAnimFrameId = requestAnimationFrame(render);
    }

    render();
}

function mostrarCroissExito(titulo, mensaje = '') {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">${titulo}</strong>`,
        html: mensaje ? `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:6px; line-height:1.4;">${mensaje}</p>` : '',
        timer: 2000,
        showConfirmButton: false,
        background: '#FFFFFF',
        customClass: {
            popup: 'croiss-swal-popup'
        }
    });
}

function abrirGoogleMaps(direccion) {
    if (!direccion) {
        Swal.fire('Sin Direccion', 'No hay una direccion registrada para este cliente/pedido.', 'info');
        return;
    }
    const dirLimpia = decodeURIComponent(direccion);
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dirLimpia)}`;
    window.open(url, '_blank');
}

function abrirGoogleMapsIngresado() {
    const dir = getInputValueSafe('vDireccionCliente');
    abrirGoogleMaps(dir);
}

async function cargarSugerenciasClientes() {
    try {
        const res = await fetch('/api/clientes');
        const data = await res.json();

        if (data.status === 'exito') {
            directorioClientesCache = data.clientes_todos || [];
            const datalist = document.getElementById('listaClientesDatalist');
            if (datalist) {
                datalist.innerHTML = '';
                directorioClientesCache.forEach(c => {
                    if (c.nombre) {
                        const opt = document.createElement('option');
                        opt.value = c.nombre;
                        datalist.appendChild(opt);
                    }
                });
            }
        }
    } catch (err) {
        console.error("Error cargando sugerencias de clientes:", err);
    }
}

function autocompletarDatosCliente() {
    const inputNombre = document.getElementById('vCliente');
    if (!inputNombre) return;

    const nombreIngresado = inputNombre.value.trim().toLowerCase();
    const emailEl = document.getElementById('vEmailCliente');
    const telEl = document.getElementById('vTelefonoCliente');
    const dirEl = document.getElementById('vDireccionCliente');

    if (!nombreIngresado) {
        if (emailEl) emailEl.value = '';
        if (telEl) telEl.value = '';
        if (dirEl) dirEl.value = '';
        clienteUltimoAutocompletado = '';
        return;
    }

    const clienteEncontrado = directorioClientesCache.find(c => 
        c.nombre && c.nombre.trim().toLowerCase() === nombreIngresado
    );

    if (clienteEncontrado) {
        if (emailEl) emailEl.value = clienteEncontrado.email || '';
        if (telEl) telEl.value = clienteEncontrado.telefono || '';
        if (dirEl) dirEl.value = clienteEncontrado.direccion || '';

        if (clienteUltimoAutocompletado !== clienteEncontrado.nombre) {
            clienteUltimoAutocompletado = clienteEncontrado.nombre;
            
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'info',
                title: `Datos de ${clienteEncontrado.nombre} cargados`,
                showConfirmButton: false,
                timer: 2000,
                background: '#FAF0EB',
                color: '#2D1E18'
            });
        }
    }
}

function cambiarTab(e, tab) {
    const btnTarget = e.currentTarget;
    const yaEstaActivo = btnTarget.classList.contains('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    if (yaEstaActivo) {
        document.getElementById('sec-home').classList.add('active');
    } else {
        btnTarget.classList.add('active');
        document.getElementById('sec-' + tab).classList.add('active');

        if(tab === 'ventas') cargarStock();
        if(tab === 'entregas') cambiarSegmentoEntrega('cuentas');
        if(tab === 'stock') cargarTodoElStock();
        if(tab === 'gastos') toggleCamposMateriaPrima();
        if(tab === 'balance') { cargarBalance(); cargarStock(); }
        if(tab === 'clientes') cargarClientes();
    }
}

function cambiarSegmentoEntrega(segmento) {
    document.getElementById('segBtnCuentas').classList.toggle('active', segmento === 'cuentas');
    document.getElementById('segBtnAgenda').classList.toggle('active', segmento === 'agenda');
    
    document.getElementById('subSecCuentas').classList.toggle('active', segmento === 'cuentas');
    document.getElementById('subSecAgenda').classList.toggle('active', segmento === 'agenda');

    if (segmento === 'cuentas') cargarCuentas();
    if (segmento === 'agenda') cargarAgenda();
}

function cambiarSegmentoCliente(segmento) {
    document.querySelectorAll('#sec-clientes .seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#sec-clientes .sub-seccion').forEach(s => s.classList.remove('active'));

    if (segmento === 'lista') {
        document.getElementById('segBtnLista').classList.add('active');
        document.getElementById('subSecLista').classList.add('active');
        datosClientesGlobal.subOrigen = 'lista';
    } else {
        document.getElementById('segBtnPromo').classList.add('active');
        document.getElementById('subSecPromo').classList.add('active');
        datosClientesGlobal.subOrigen = 'promo';
    }
}

function cambiarSegmentoGasto(segmento) {
    document.getElementById('segBtnNuevoGasto').classList.toggle('active', segmento === 'nuevo');
    document.getElementById('segBtnHistorialGasto').classList.toggle('active', segmento === 'historial');
    
    document.getElementById('subSecNuevoGasto').classList.toggle('active', segmento === 'nuevo');
    document.getElementById('subSecHistorialGasto').classList.toggle('active', segmento === 'historial');

    if (segmento === 'historial') {
        cargarInsumosYGastos();
    }
}

function toggleCamposMateriaPrima() {
    const catEl = document.getElementById('gCategoria');
    const box = document.getElementById('boxCamposInsumo');
    const boxMP = document.getElementById('boxSugerenciasMateriaPrima');
    const boxCajas = document.getElementById('boxSugerenciasCajas');
    const unidadEl = document.getElementById('gUnidad');

    if (catEl && box) {
        const esInsumoOEmbalaje = (catEl.value === 'Materia Prima' || catEl.value === 'Embalaje');
        box.style.display = esInsumoOEmbalaje ? 'flex' : 'none';

        if (boxMP) boxMP.style.display = (catEl.value === 'Materia Prima') ? 'flex' : 'none';
        if (boxCajas) boxCajas.style.display = (catEl.value === 'Embalaje') ? 'flex' : 'none';

        if (catEl.value === 'Embalaje' && unidadEl) {
            unidadEl.value = 'un';
        }
    }
}

function seleccionarInsumoRapido(nombreInsumo, unidadPredeterminada = '') {
    const descEl = document.getElementById('gDescripcion');
    const unidadEl = document.getElementById('gUnidad');

    if (descEl) descEl.value = nombreInsumo;
    if (unidadEl && unidadPredeterminada) unidadEl.value = unidadPredeterminada;
}

async function cargarStock(forzar = false) {
    if (isFetchingStock) return;

    cargarSugerenciasClientes();

    if (catalogoProductos.length > 0 && !forzar) {
        renderizarMenuYStock();
        return;
    }

    isFetchingStock = true;

    try {
        const res = await fetch('/api/stock');
        const data = await res.json();
        
        if (data.status === 'exito' && Array.isArray(data.productos)) {
            catalogoProductos = data.productos;
            renderizarMenuYStock();
        }
    } catch (err) {
        console.error("Error al cargar stock:", err);
    } finally {
        isFetchingStock = false;
    }
}

// MUESTRA EL MENU Y PRECIOS INFORMATIVOS (SIN CONTADOR INDIVIDUAL)
function renderizarMenuYStock() {
    const select = document.getElementById('vProductoSelect');
    const lista = document.getElementById('listaStock');

    const seleccionPrevia = select ? select.value : '';

    if (select) {
        select.innerHTML = '<option value="" disabled selected>Seleccionar croissant...</option>';
    }
    if (lista) lista.innerHTML = '';

    catalogoProductos.forEach(prod => {
        const nombreProd = prod.Nombre || prod.Producto || prod.nombre || prod.producto || prod.Croissant || '';
        if (!nombreProd || nombreProd.toLowerCase().includes('congelado')) return;

        if (select) {
            const opt = document.createElement('option');
            opt.value = nombreProd;
            opt.innerText = nombreProd;
            select.appendChild(opt);
        }

        if (lista) {
            const precioVenta = prod['Precio Venta'] !== undefined ? prod['Precio Venta'] : (prod['Precio'] || 0);

            const div = document.createElement('div');
            div.className = 'stock-item';
            div.style.padding = '12px';
            div.innerHTML = `
                <div>
                    <strong>${nombreProd}</strong><br>
                    <small style="color:var(--text-muted); font-weight:600;">$${precioVenta} c/u</small>
                </div>
            `;
            lista.appendChild(div);
        }
    });

    if (select && seleccionPrevia) {
        const existe = Array.from(select.options).some(o => o.value === seleccionPrevia);
        if (existe) select.value = seleccionPrevia;
    }
}

async function cargarTodoElStock() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const resCong = await fetch('/api/stock/congelados');
        const dataCong = await resCong.json();
        if (dataCong.status === 'exito') {
            const elCong = document.getElementById('cantCroissCongelados');
            if (elCong) elCong.innerText = `${dataCong.stock} un.`;
        }

        await cargarStock(true);
        await cargarInsumosYGastos();

        await esperarAnimacionMinima(tInicio, 1500);
        Swal.close();
    } catch (err) {
        Swal.close();
        console.error("Error al cargar todo el stock:", err);
    }
}

function abrirModalSumarCongelados() {
    Swal.fire({
        title: 'Agregar Produccion de Masas',
        customClass: {
            popup: 'croiss-swal-popup',
            title: 'croiss-swal-title',
            confirmButton: 'croiss-swal-confirm',
            cancelButton: 'croiss-swal-cancel'
        },
        buttonsStyling: false,
        html: `
            <div style="text-align: left; margin-top: 14px;">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">
                    Cantidad de masas preparadas
                </label>
                <input type="number" id="inputSumarCongelados" class="croiss-swal-input" value="20" min="1" placeholder="Ej: 20">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '+ Sumar al Stock',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
            const cant = document.getElementById('inputSumarCongelados').value;
            if (!cant || parseInt(cant) <= 0) {
                Swal.showValidationMessage('Ingresá una cantidad valida.');
                return false;
            }
            return parseInt(cant);
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();

            try {
                const res = await fetch('/api/stock/congelados', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ cantidad: result.value })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1500);

                if (data.status === 'exito') {
                    mostrarCroissExito('Produccion Agregada!', `Se sumaron +${result.value} masas al stock congelado.`);
                    const elCong = document.getElementById('cantCroissCongelados');
                    if (elCong) elCong.innerText = `${data.stock} un.`;
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                console.error("Error al actualizar congelados:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

// AGENDA EXPANDIBLE, EDICION Y PDF
async function cargarAgenda() {
    const contenedor = document.getElementById('listaAgenda');
    if(!contenedor) return;

    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/agenda');
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);
        Swal.close();

        if(data.status === 'exito') {
            contenedor.innerHTML = '';
            agendaGlobalData = data.agenda || [];

            data.agenda.forEach((dia, idxDia) => {
                const total = dia.total_croissants;
                const limite = 35;
                const porcentaje = Math.min(100, Math.round((total / limite) * 100));

                let claseBadge = 'badge-ok';
                if (total >= 35) claseBadge = 'badge-full';
                else if (total >= 25) claseBadge = 'badge-warning';

                let htmlPedidos = '';
                if(!dia.pedidos || dia.pedidos.length === 0) {
                    htmlPedidos = '<p style="font-size:0.85rem; color:#94a3b8; font-style:italic; padding:8px 0;">Sin pedidos para este dia.</p>';
                } else {
                    dia.pedidos.forEach(p => {
                        const esPagado = (p.estado || '').toLowerCase() === 'pagado';
                        const badgePago = esPagado ? '<span style="color:#16a34a; font-weight:700;">Pagado</span>' : '<span style="color:#dc2626; font-weight:700;">Pendiente</span>';

                        const btnMaps = p.direccion ? `
                            <button type="button" class="btn-jalea-chip" style="font-size:0.72rem; padding: 3px 8px;" onclick="abrirGoogleMaps('${encodeURIComponent(p.direccion)}')">Maps</button>
                        ` : '';

                        let infoContacto = [];
                        if (p.telefono) infoContacto.push(`Tel: ${p.telefono}`);
                        if (p.email) infoContacto.push(`Email: ${p.email}`);
                        let strContacto = infoContacto.length > 0 ? `<div style="font-size:0.78rem; color:#64748b; margin-top:2px;">${infoContacto.join(' | ')}</div>` : '';

                        htmlPedidos += `
                            <div style="background:#FAF9F8; border:1px solid var(--border-color); border-radius:14px; padding:12px; margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                    <div>
                                        <strong style="font-size:0.95rem; color:var(--text-main);">${p.cliente}</strong>
                                        <small style="margin-left:6px;">(${badgePago})</small>
                                        ${strContacto}
                                        ${p.direccion ? `<div style="font-size:0.8rem; color:#475569; margin-top:3px;">Dir: ${p.direccion}</div>` : ''}
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="font-weight:800; color:#d97706; font-size:1rem;">${p.cantidad} un.</span>
                                    </div>
                                </div>
                                
                                <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #E2D9D3; display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.85rem; color:#334155; font-weight:600;">${p.descripcion}</span>
                                    <div style="display:flex; gap:6px; align-items:center;">
                                        ${btnMaps}
                                        <button type="button" class="btn-jalea-chip active" style="font-size:0.72rem; padding: 3px 8px;" onclick="abrirEdicionPedido(${p.fila})">Editar</button>
                                    </div>
                                </div>
                            </div>
                        `;
                    });
                }

                const card = document.createElement('div');
                card.className = 'card agenda-card';
                card.style.boxShadow = 'none';
                card.style.border = '1px solid var(--border-color)';
                
                const tienePedidos = dia.pedidos && dia.pedidos.length > 0;
                const idDetalle = `dia-detalle-${idxDia}`;

                card.innerHTML = `
                    <div class="agenda-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="cursor:pointer; flex:1;" onclick="toggleExpandirDia('${idDetalle}')">
                            <span class="agenda-titulo">
                                <span id="arrow-${idDetalle}" style="display:inline-block; transition:transform 0.2s;">></span> ${dia.nombre_dia}
                            </span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <span class="agenda-badge ${claseBadge}">${total} / 35 croiss</span>
                            ${tienePedidos ? `<button type="button" class="btn-jalea-chip active" style="margin:0; padding: 4px 10px;" onclick="generarPDFDia('${dia.fecha}')">PDF</button>` : ''}
                        </div>
                    </div>
                    <div class="progress-bar-bg" style="cursor:pointer; margin-top:8px;" onclick="toggleExpandirDia('${idDetalle}')">
                        <div class="progress-bar-fill ${claseBadge}" style="width: ${porcentaje}%"></div>
                    </div>
                    
                    <div id="${idDetalle}" style="display:${idxDia === 0 ? 'block' : 'none'}; margin-top: 14px;">
                        ${htmlPedidos}
                    </div>
                `;
                contenedor.appendChild(card);
            });
        }
    } catch (err) {
        Swal.close();
        console.error("Error al cargar la agenda:", err);
        contenedor.innerHTML = '<p style="color:red; text-align:center;">Error al cargar la agenda.</p>';
    }
}

function toggleExpandirDia(idDetalle) {
    const cont = document.getElementById(idDetalle);
    const arrow = document.getElementById(`arrow-${idDetalle}`);
    if (cont) {
        const estaOculto = cont.style.display === 'none';
        cont.style.display = estaOculto ? 'block' : 'none';
        if (arrow) arrow.style.transform = estaOculto ? 'rotate(90deg)' : 'rotate(0deg)';
    }
}

// EDITOR INTERACTIVO DE ITEMS POR PEDIDO
function parsearDescripcionAPedidos(desc) {
    if(!desc) return [];
    let partes = desc.split(',');
    let items = [];
    partes.forEach(p => {
        let itemClean = p.trim();
        if(!itemClean) return;
        let conJalea = itemClean.toLowerCase().includes('(con jalea)');
        let sinJaleaStr = itemClean.replace(/\(con jalea\)/gi, '').trim();
        let match = sinJaleaStr.match(/^(\d+)x\s+(.+)/i);
        if(match) {
            items.push({
                cantidad: parseInt(match[1]) || 1,
                producto: match[2].trim(),
                con_jalea: conJalea
            });
        } else {
            items.push({
                cantidad: 1,
                producto: sinJaleaStr,
                con_jalea: conJalea
            });
        }
    });
    return items;
}

function generarHtmlListaEdicion() {
    if (!itemsEdicionTemp || itemsEdicionTemp.length === 0) {
        return '<p style="color:#94a3b8; text-align:center;">Sin productos en el pedido</p>';
    }

    let html = '';
    itemsEdicionTemp.forEach((item, idx) => {
        const claseJalea = item.con_jalea ? 'active' : '';
        const textoJalea = item.con_jalea ? 'Con Jalea' : 'Sin Jalea';

        let optionsHtml = '';
        if (Array.isArray(catalogoProductos) && catalogoProductos.length > 0) {
            catalogoProductos.forEach(p => {
                let name = p.Nombre || p.Producto || p.nombre || p.producto || p.Croissant || '';
                if (name && !name.toLowerCase().includes('congelado')) {
                    let selected = name.toLowerCase().trim() === item.producto.toLowerCase().trim() ? 'selected' : '';
                    optionsHtml += `<option value="${name}" ${selected}>${name}</option>`;
                }
            });
        }

        let selectorProducto = '';
        if (optionsHtml) {
            selectorProducto = `
                <select onchange="actualizarProdEdicion(${idx}, this.value)" class="croiss-swal-input" style="margin:0 !important; padding:8px 10px !important; font-size:0.85rem !important;">
                    ${optionsHtml}
                    ${!catalogoProductos.some(cp => (cp.Nombre||cp.Producto||'').toLowerCase().trim() === item.producto.toLowerCase().trim()) ? `<option value="${item.producto}" selected>${item.producto}</option>` : ''}
                </select>
            `;
        } else {
            selectorProducto = `
                <input type="text" value="${item.producto}" onchange="actualizarProdEdicion(${idx}, this.value)" class="croiss-swal-input" style="margin:0 !important; padding:8px 10px !important; font-size:0.85rem !important;">
            `;
        }

        html += `
            <div style="background:#FAF9F8; border:1px solid var(--border-color); border-radius:12px; padding:10px; margin-bottom:8px; text-align:left;">
                <div style="display:flex; gap:8px; align-items:center; margin-bottom:6px;">
                    <div style="width:65px;">
                        <label style="font-size:0.65rem; margin-bottom:2px; display:block;">CANT.</label>
                        <input type="number" min="1" value="${item.cantidad}" onchange="actualizarCantEdicion(${idx}, this.value)" class="croiss-swal-input" style="margin:0 !important; padding:6px !important; text-align:center;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:0.65rem; margin-bottom:2px; display:block;">PRODUCTO</label>
                        ${selectorProducto}
                    </div>
                    <button type="button" class="btn-remove" style="padding:6px 10px; font-size:0.8rem; margin-top:14px;" onclick="eliminarItemEdicion(${idx})">X</button>
                </div>
                <div>
                    <button type="button" class="btn-jalea-chip ${claseJalea}" style="margin:0; font-size:0.75rem; padding:4px 10px;" onclick="toggleJaleaEdicion(${idx})">
                        ${textoJalea}
                    </button>
                </div>
            </div>
        `;
    });
    return html;
}

function refrescarDomEdicion() {
    const cont = document.getElementById('contenedorItemsEdicion');
    if (cont) cont.innerHTML = generarHtmlListaEdicion();
}

function actualizarCantEdicion(idx, val) {
    if(itemsEdicionTemp[idx]) {
        itemsEdicionTemp[idx].cantidad = Math.max(1, parseInt(val) || 1);
    }
}

function actualizarProdEdicion(idx, val) {
    if(itemsEdicionTemp[idx]) {
        itemsEdicionTemp[idx].producto = val.trim();
    }
}

function toggleJaleaEdicion(idx) {
    if(itemsEdicionTemp[idx]) {
        itemsEdicionTemp[idx].con_jalea = !itemsEdicionTemp[idx].con_jalea;
        refrescarDomEdicion();
    }
}

function eliminarItemEdicion(idx) {
    if(itemsEdicionTemp.length <= 1) {
        Swal.fire('Atencion', 'El pedido debe conservar al menos un producto.', 'info');
        return;
    }
    itemsEdicionTemp.splice(idx, 1);
    refrescarDomEdicion();
}

function agregarItemEdicion() {
    let primerProducto = 'Croissant Clasico';
    if (Array.isArray(catalogoProductos) && catalogoProductos.length > 0) {
        let pValid = catalogoProductos.find(p => {
            let name = p.Nombre || p.Producto || '';
            return name && !name.toLowerCase().includes('congelado');
        });
        if(pValid) primerProducto = pValid.Nombre || pValid.Producto;
    }
    itemsEdicionTemp.push({
        cantidad: 1,
        producto: primerProducto,
        con_jalea: false
    });
    refrescarDomEdicion();
}

function abrirEdicionPedido(numFila) {
    if (!numFila) {
        Swal.fire('Error', 'No se encontro el numero de fila del pedido', 'error');
        return;
    }

    let pEncontrado = null;
    if (Array.isArray(agendaGlobalData)) {
        for (let dia of agendaGlobalData) {
            if (dia.pedidos) {
                let p = dia.pedidos.find(item => item.fila === numFila);
                if (p) { pEncontrado = p; break; }
            }
        }
    }

    if (!pEncontrado) {
        Swal.fire('Error', 'No se encontro la informacion del pedido', 'error');
        return;
    }

    itemsEdicionTemp = parsearDescripcionAPedidos(pEncontrado.descripcion);
    if (itemsEdicionTemp.length === 0) {
        itemsEdicionTemp = [{ cantidad: 1, producto: 'Croissant Clasico', con_jalea: false }];
    }

    Swal.fire({
        title: `Editar Pedido de ${pEncontrado.cliente}`,
        html: `
            <div style="max-height:350px; overflow-y:auto; padding-right:4px;" id="contenedorItemsEdicion">
                ${generarHtmlListaEdicion()}
            </div>
            <button type="button" class="btn-jalea-chip active" style="margin-top:12px; width:100%; padding:8px;" onclick="agregarItemEdicion()">+ Agregar otro producto</button>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' },
        focusConfirm: false,
        preConfirm: () => {
            if (!itemsEdicionTemp || itemsEdicionTemp.length === 0) {
                Swal.showValidationMessage('El pedido debe tener al menos un producto.');
                return false;
            }
            let resumen = [];
            let totalCant = 0;
            for (let item of itemsEdicionTemp) {
                let prodNombre = (item.producto || '').trim();
                let cant = parseInt(item.cantidad) || 1;
                if (!prodNombre) {
                    Swal.showValidationMessage('Todos los productos deben tener un nombre valido.');
                    return false;
                }
                let jaleaStr = item.con_jalea ? ' (Con Jalea)' : '';
                resumen.push(`${cant}x ${prodNombre}${jaleaStr}`);
                totalCant += cant;
            }
            return {
                fila: numFila,
                producto: resumen.join(', '),
                cantidad: totalCant
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed && result.value) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/editar_pedido', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(result.value)
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1500);

                if(data.status === 'exito') {
                    mostrarCroissExito('Pedido Actualizado', 'Se guardaron los cambios en Google Sheets.');
                    cargarAgenda();
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch(e) {
                Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error');
            }
        }
    });
}

function generarPDFDia(fecha) {
    const diaData = agendaGlobalData.find(d => d.fecha === fecha);
    if(!diaData || !diaData.pedidos || diaData.pedidos.length === 0) {
        Swal.fire('Atencion', 'No hay pedidos registrados para este dia.', 'warning');
        return;
    }

    if (!window.jspdf || !window.jspdf.jsPDF) {
        Swal.fire('Error', 'Las librerias PDF no estan cargadas. Revisa tu conexion a internet.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(200, 109, 40);
    doc.text("CROISS - Hoja de Produccion y Armado", 14, 20);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(45, 30, 24);
    doc.text(`Fecha: ${diaData.nombre_dia} (${fecha}) | Total Croissants: ${diaData.total_croissants} un.`, 14, 28);
    
    let bodyPedidos = [];
    diaData.pedidos.forEach(p => {
        let contactoStr = p.cliente || 'Cliente';
        if(p.telefono) contactoStr += `\nTel: ${p.telefono}`;
        if(p.direccion) contactoStr += `\nDir: ${p.direccion}`;

        bodyPedidos.push([contactoStr, p.descripcion || '-', (p.cantidad || 0) + ' un.']);
    });
    
    doc.autoTable({
        startY: 34,
        head: [['Cliente / Datos de Entrega', 'Detalle del Pedido', 'Cantidad']],
        body: bodyPedidos,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [45, 30, 24], fontStyle: 'bold' }
    });
    
    let resumenCantidades = {};
    diaData.pedidos.forEach(p => {
        if (p.descripcion) {
            let itemsStr = p.descripcion.split(',');
            itemsStr.forEach(item => {
                let itemLimpio = item.trim();
                if (!itemLimpio) return;
                let match = itemLimpio.match(/^(\d+)x\s+(.+)/);
                if(match) {
                    let cant = parseInt(match[1]);
                    let sabor = match[2].trim();
                    resumenCantidades[sabor] = (resumenCantidades[sabor] || 0) + cant;
                } else {
                    resumenCantidades[itemLimpio] = (resumenCantidades[itemLimpio] || 0) + 1;
                }
            });
        }
    });
    
    let bodyResumen = Object.keys(resumenCantidades).map(sabor => {
        return [sabor, resumenCantidades[sabor] + ' un.'];
    });
    
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 12,
        head: [['Resumen Total de Sabores (A Hornear)', 'Total Unidades']],
        body: bodyResumen,
        theme: 'grid',
        styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 3 },
        headStyles: { fillColor: [200, 109, 40], fontStyle: 'bold' }
    });
    
    doc.save(`Agenda_CROISS_${fecha}.pdf`);
}

async function cargarCuentas() {
    const contPago = document.getElementById('listaPendientesPago');
    const contEntrega = document.getElementById('listaPendientesEntrega');
    const bannerTotal = document.getElementById('cMontoPendienteTotal');

    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/cuentas');
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);
        Swal.close();

        if (data.status === 'exito') {
            if(bannerTotal) bannerTotal.innerText = `$${data.total_por_cobrar}`;

            if(contPago) {
                contPago.innerHTML = '';
                if (data.pendientes_pago.length === 0) {
                    contPago.innerHTML = '<p style="font-size:0.85rem; color:#16a34a; font-weight:600;">Excelente! Nadie te debe dinero.</p>';
                } else {
                    data.pendientes_pago.forEach(p => {
                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>${p.cliente}</strong> <small style="color:#64748b;">(Entrega: ${p.fecha_entrega})</small><br>
                                <span style="font-size:0.85rem; color:#475569;">${p.producto} (${p.cantidad} un.)</span><br>
                                <span style="font-size:0.9rem; font-weight:800; color:#dc2626;">Monto: $${p.monto}</span>
                            </div>
                            <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
                                <button class="btn-pagar-ahora" onclick="marcarComoPagado(${p.fila}, '${p.cliente}')">Marcar Pagado</button>
                                <button type="button" class="btn-remove" style="font-size:0.72rem; padding:4px 8px;" onclick="eliminarPedido(${p.fila}, '${p.cliente}')">Cancelar</button>
                            </div>
                        `;
                        contPago.appendChild(div);
                    });
                }
            }

            if(contEntrega) {
                contEntrega.innerHTML = '';
                if (data.pendientes_entrega.length === 0) {
                    contEntrega.innerHTML = '<p style="font-size:0.85rem; color:#64748b; font-style:italic;">No hay pedidos programados para entregar pronto.</p>';
                } else {
                    data.pendientes_entrega.forEach(e => {
                        const esPagado = e.estado.toLowerCase() === 'pagado';
                        const badgeClase = esPagado ? 'badge-ok' : 'badge-full';
                        const badgeTexto = esPagado ? 'Pagado' : 'Debe';

                        const btnMaps = e.direccion ? `
                            <button type="button" class="btn-jalea-chip" style="padding: 4px 8px; font-size: 0.72rem; margin-top:0;" onclick="abrirGoogleMaps('${encodeURIComponent(e.direccion)}')">Ver Mapa</button>
                        ` : '';

                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>${e.fecha_entrega} - ${e.cliente}</strong><br>
                                <span style="font-size:0.85rem; color:#334155;">${e.producto} (${e.cantidad} un.)</span>
                                ${e.direccion ? `<br><small style="color:#64748b;">Dir: ${e.direccion}</small>` : ''}
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                                <span class="agenda-badge ${badgeClase}">${badgeTexto}</span>
                                ${btnMaps}
                                <div style="display:flex; gap:6px; margin-top:2px;">
                                    <button class="btn-jalea-chip active" style="padding: 6px 10px; font-size: 0.75rem;" onclick="notificarEntrega(${e.fila}, '${e.cliente}')">Entregado</button>
                                    <button type="button" class="btn-remove" style="font-size:0.72rem; padding:4px 8px;" onclick="eliminarPedido(${e.fila}, '${e.cliente}')">X</button>
                                </div>
                            </div>
                        `;
                        contEntrega.appendChild(div);
                    });
                }
            }
        }
    } catch (err) {
        Swal.close();
        console.error("Error al cargar entregas:", err);
    }
}

async function eliminarPedido(numFila, clienteNombre) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">Cancelar este pedido?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se eliminara la orden de <strong style="color:var(--text-main);">${clienteNombre}</strong> de la planilla.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Si, eliminar',
        cancelButtonText: 'No, conservar',
        buttonsStyling: false,
        customClass: {
            popup: 'croiss-swal-popup',
            confirmButton: 'croiss-btn-danger',
            cancelButton: 'croiss-swal-cancel'
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/eliminar_venta', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Pedido Cancelado', 'Se removio la orden de la agenda.');
                    
                    // Actualizaciones en pantalla
                    if (typeof cargarCuentas === 'function') cargarCuentas();
                    if (typeof cargarAgenda === 'function') cargarAgenda();
                    if (typeof cargarClientes === 'function') cargarClientes(); // <--- Recarga la lista de clientes
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                console.error("Error al eliminar pedido:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

async function notificarEntrega(numFila, nombreCliente) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">Confirmar entrega?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se enviara el mail de agradecimiento a <strong style="color:var(--text-main);">${nombreCliente}</strong>.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Si, entregar y notificar',
        cancelButtonText: 'Cancelar',
        buttonsStyling: false,
        customClass: {
            popup: 'croiss-swal-popup',
            confirmButton: 'croiss-swal-confirm',
            cancelButton: 'croiss-swal-cancel'
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/marcar_entregado', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Pedido Entregado!', `Notificacion enviada a ${nombreCliente}.`);
                    cargarCuentas();
                    if (typeof cargarClientes === 'function') cargarClientes(); // Recarga la información de Clientes
                } else {
                    Swal.fire('Atencion', data.mensaje, 'warning');
                }
            } catch (err) {
                console.error("Error al notificar entrega:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

async function marcarComoPagado(numFila, nombreCliente) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">Confirmar cobro?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se marcara la orden de <strong style="color:var(--text-main);">${nombreCliente}</strong> como PAGADA.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Si, cobrado',
        cancelButtonText: 'Cancelar',
        buttonsStyling: false,
        customClass: {
            popup: 'croiss-swal-popup',
            confirmButton: 'croiss-swal-confirm',
            cancelButton: 'croiss-swal-cancel'
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            
            try {
                const res = await fetch('/api/cambiar_estado_pago', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila, estado: 'Pagado' })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cobro Registrado!', `El pedido de ${nombreCliente} ya figura al dia.`);
                    cargarCuentas();
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                console.error("Error en la peticion:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

let chartSaboresInstance = null;
let chartDiasInstance = null;

function cambiarSegmentoBalance(segmento) {
    document.getElementById('segBtnBalance').classList.toggle('active', segmento === 'balance');
    document.getElementById('segBtnSabores').classList.toggle('active', segmento === 'sabores');
    document.getElementById('segBtnEvolucion').classList.toggle('active', segmento === 'evolucion');
    
    document.getElementById('subSecBalance').classList.toggle('active', segmento === 'balance');
    document.getElementById('subSecSabores').classList.toggle('active', segmento === 'sabores');
    document.getElementById('subSecEvolucion').classList.toggle('active', segmento === 'evolucion');

    cargarBalance();
}

async function cargarBalance() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const mesVal = document.getElementById('bMesFilter').value || hoy.substring(0, 7);
        let url = `/api/balance?mes=${mesVal}`;

        const res = await fetch(url);
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);
        Swal.close();

        if(data.status === 'exito') {
            // 1. Pestaña Finanzas
            document.getElementById('bIngresos').innerText = `$${data.ingresos}`;
            document.getElementById('bCostos').innerText = `$${data.costos_produccion}`;
            document.getElementById('bGastos').innerText = `$${data.gastos_varios}`;
            document.getElementById('bTicketPromedio').innerText = `$${data.ticket_promedio}`;

            const gananciaEl = document.getElementById('bGanancia');
            gananciaEl.innerText = `$${data.ganancia_neta}`;
            gananciaEl.style.color = data.ganancia_neta < 0 ? "#ef4444" : "#16a34a";

            // 2. Futurología y Proyección
            const proy = data.proyeccion;
            const txtCroiss = document.getElementById('txtProyeccionCroiss');
            const txtIng = document.getElementById('txtProyeccionIngresos');

            if (proy.es_mes_actual) {
                txtCroiss.innerText = `~${proy.croissants_estimados} Croissants`;
                txtIng.innerText = `Ingresos estimados: $${proy.ingresos_estimados} al cierre del mes`;
            } else {
                txtCroiss.innerText = `${data.total_croissants} Croissants Vendidos`;
                txtIng.innerText = `Total final del período cerrado`;
            }

            // Stat Jalea
            document.getElementById('txtPorcentajeJalea').innerText = `${data.stats_jalea.porcentaje}% (${data.stats_jalea.con_jalea} un.)`;

            // Ranking de Sabores
            const contRank = document.getElementById('listaRankingSabores');
            contRank.innerHTML = '';
            if (!data.ranking_sabores || data.ranking_sabores.length === 0) {
                contRank.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">Sin ventas registradas en este mes.</p>';
            } else {
                data.ranking_sabores.forEach(r => {
                    const div = document.createElement('div');
                    div.className = 'ios-cliente-row compact';
                    div.style.cursor = 'default';
                    div.innerHTML = `
                        <div>
                            <strong>🥐 ${r.sabor}</strong><br>
                            <small style="color:var(--text-muted);">${r.porcentaje}% del total de ventas</small>
                        </div>
                        <strong style="color:var(--accent); font-size:0.95rem;">${r.cantidad} un.</strong>
                    `;
                    contRank.appendChild(div);
                });
            }

            // Gráfico Donut - Sabores
            renderizarGraficoSabores(data.ranking_sabores);

            // Gráfico Barras - Días de la semana
            renderizarGraficoDias(data.dias_semana);

            // 3. Pestaña Evolución
            const contEvolucion = document.getElementById('listaEvolucionMeses');
            if (contEvolucion) {
                contEvolucion.innerHTML = '';
                if (data.historico_meses.length === 0) {
                    contEvolucion.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay registros históricos.</p>';
                } else {
                    data.historico_meses.forEach(m => {
                        const esPositivo = m.ganancia_neta >= 0;
                        const colorGanancia = esPositivo ? '#16a34a' : '#dc2626';

                        const div = document.createElement('div');
                        div.className = 'ios-cliente-row compact';
                        div.style.cursor = 'default';
                        div.innerHTML = `
                            <div>
                                <strong>Fecha: ${m.mes_key}</strong> <small style="color:var(--text-muted);">(${m.pedidos} pedidos)</small><br>
                                <small style="color:#64748b;">Ingresos: $${m.ingresos} | Egresos: $${m.gastos_totales}</small>
                            </div>
                            <div style="text-align:right;">
                                <strong style="color:${colorGanancia}; font-size:0.95rem;">$${m.ganancia_neta}</strong><br>
                                <small style="color:var(--text-muted); font-size:0.7rem;">Ganancia Neta</small>
                            </div>
                        `;
                        contEvolucion.appendChild(div);
                    });
                }
            }
        }
    } catch(err) {
        Swal.close();
        console.error("Error al cargar balance:", err);
    }
}

function renderizarGraficoSabores(ranking) {
    const ctx = document.getElementById('chartSaboresCanvas');
    if (!ctx) return;

    if (chartSaboresInstance) chartSaboresInstance.destroy();

    const labels = ranking.map(r => r.sabor);
    const dataVals = ranking.map(r => r.cantidad);

    chartSaboresInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataVals,
                backgroundColor: ['#C86D28', '#2D1E18', '#D97706', '#9A4D15', '#7A6B63', '#CBD5E1']
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } }
            }
        }
    });
}

function renderizarGraficoDias(diasObj) {
    const ctx = document.getElementById('chartDiasCanvas');
    if (!ctx) return;

    if (chartDiasInstance) chartDiasInstance.destroy();

    const labels = Object.keys(diasObj);
    const dataVals = Object.values(diasObj);

    chartDiasInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Croissants Entregados',
                data: dataVals,
                backgroundColor: '#C86D28',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { precision: 0 } }
            }
        }
    });
}

async function cargarInsumosYGastos() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/gastos_e_insumos');
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);
        Swal.close();

        if (data.status === 'exito') {
            const contInsumos = document.getElementById('listaInsumosStock');
            if (contInsumos) {
                contInsumos.innerHTML = '';
                if (data.insumos.length === 0) {
                    contInsumos.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay insumos registrados aun.</p>';
                } else {
                    data.insumos.forEach(ins => {
                        const vencFecha = ins['Vencimiento Proximo'] || ins['Vencimiento Proximo'] || 'Sin fecha';
                        const div = document.createElement('div');
                        div.className = 'ios-cliente-row compact';
                        div.innerHTML = `
                            <div>
                                <strong>Insumo: ${ins.Insumo}</strong><br>
                                <small style="color:var(--text-muted);">Vence: ${vencFecha}</small>
                            </div>
                            <div>
                                <strong style="color:var(--accent); font-size:1rem;">${ins['Stock Actual']} ${ins.Unidad}</strong>
                            </div>
                        `;
                        contInsumos.appendChild(div);
                    });
                }
            }

            const contGastos = document.getElementById('listaGastosHistorico');
            if (contGastos) {
                contGastos.innerHTML = '';
                if (data.gastos.length === 0) {
                    contGastos.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay gastos cargados.</p>';
                } else {
                    data.gastos.forEach(g => {
                        const desc = g.Descripcion || g.descripcion || 'Gasto';
                        const cat = g.Categoria || g.categoria || 'Otros';
                        const fecha = g.Fecha || g.fecha || '';
                        const monto = g.Monto || g.monto || 0;
                        const cant = g.Cantidad || g.cantidad || 1;
                        const unidad = g.Unidad || g.unidad || '';

                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>Fecha: ${fecha} - ${desc}</strong> <small style="color:#64748b;">(${cat})</small><br>
                                <span style="font-size:0.85rem; color:#475569;">Cant: ${cant} ${unidad}</span>
                            </div>
                            <strong style="color:#dc2626; font-size:0.95rem;">-$${monto}</strong>
                        `;
                        contGastos.appendChild(div);
                    });
                }
            }
        }
    } catch (err) {
        Swal.close();
        console.error("Error cargando inventario:", err);
    }
}

function filtrarDirectorioClientes() {
    const textoBuscado = document.getElementById('inputBuscarCliente').value.toLowerCase().trim();
    const listaFiltrada = datosClientesGlobal.todos.filter(c => 
        c.nombre.toLowerCase().includes(textoBuscado)
    );
    renderizarListaDirectorio(listaFiltrada);
}

async function cargarClientes() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const mesVal = document.getElementById('cMesFilter').value || hoy.substring(0, 7);
        const res = await fetch(`/api/clientes?mes=${mesVal}`);
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);
        Swal.close();

        if (data.status === 'exito') {
            datosClientesGlobal.todos = data.clientes_todos || [];
            datosClientesGlobal.ranking = data.ranking_mes || [];

            renderizarListaDirectorio(datosClientesGlobal.todos);

            const bannerNombre = document.getElementById('topNombre');
            const bannerDetalle = document.getElementById('topDetalle');
            if (data.top_cliente_mes) {
                bannerNombre.innerText = data.top_cliente_mes.nombre;
                bannerDetalle.innerText = `Lidera con ${data.top_cliente_mes.total_croissants} croissants comprados`;
            } else {
                bannerNombre.innerText = 'Sin Compradores';
                bannerDetalle.innerText = 'Aún no se registraron ventas en este mes.';
            }

            const contRanking = document.getElementById('listaClientesRanking');
            if (contRanking) {
                contRanking.innerHTML = '';
                if (!data.ranking_mes || data.ranking_mes.length === 0) {
                    contRanking.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">Sin ventas en el período seleccionado.</p>';
                } else {
                    data.ranking_mes.forEach((c, idx) => {
                        const div = document.createElement('div');
                        div.className = 'ios-cliente-row compact';
                        div.style.cursor = 'pointer';
                        div.onclick = (e) => {
                            e.preventDefault();
                            verDetalleCliente(c);
                        };
                        div.innerHTML = `
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="cliente-rank-pos" style="font-weight: 800; color: var(--accent);">#${idx + 1}</span>
                                <div>
                                    <strong>${c.nombre || 'Cliente'}</strong>
                                </div>
                            </div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <strong style="color:var(--accent); font-size:0.95rem; background: var(--accent-light); padding: 4px 10px; border-radius: 12px;">
                                    ${c.total_croissants || 0} un.
                                </strong>
                                <span style="color:#CBD5E1; font-weight:bold; font-size:1rem;">></span>
                            </div>
                        `;
                        contRanking.appendChild(div);
                    });
                }
            }
        }
    } catch (err) {
        Swal.close();
        console.error("Error al cargar clientes:", err);
    }
}

function renderizarListaDirectorio(lista) {
    const contDirectorio = document.getElementById('listaClientesDirectorio');
    const labelCant = document.getElementById('cantClientesLabel');
    
    if (labelCant) labelCant.innerText = `Directorio General (${lista ? lista.length : 0} clientes)`;
    if (!contDirectorio) return;

    contDirectorio.innerHTML = '';

    if (!lista || lista.length === 0) {
        contDirectorio.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:20px 0;">No se encontraron clientes.</p>';
        return;
    }

    lista.forEach(c => {
        const div = document.createElement('div');
        div.className = 'ios-cliente-row compact';
        div.style.cursor = 'pointer';
        div.onclick = (e) => {
            e.preventDefault();
            verDetalleCliente(c);
        };
        div.innerHTML = `
            <div>
                <strong>${c.nombre || 'Sin nombre'}</strong><br>
                <small style="color:var(--text-muted);">${c.total_pedidos || 0} pedido(s) - ${c.total_croissants || 0} croiss.</small>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <strong style="color:var(--text-main); font-size:0.9rem;">$${c.total_gastado || 0}</strong>
                <span style="color:#CBD5E1; font-weight:bold; font-size:1rem;">></span>
            </div>
        `;
        contDirectorio.appendChild(div);
    });
}

function verDetalleCliente(clienteObj) {
    if (!clienteObj) return;
    clienteDetalleActual = clienteObj;

    document.querySelectorAll('#sec-clientes .sub-seccion').forEach(s => s.classList.remove('active'));
    const secDetalle = document.getElementById('subSecDetalle');
    if (secDetalle) secDetalle.classList.add('active');

    const elNom = document.getElementById('detClienteNombre');
    if (elNom) elNom.innerText = clienteObj.nombre || 'Cliente';

    const elStats = document.getElementById('detClienteStats');
    if (elStats) {
        elStats.innerText = `Histórico: $${clienteObj.total_gastado || 0} gastados en ${clienteObj.total_croissants || 0} croissants (${clienteObj.total_pedidos || 0} pedidos)`;
    }

    const contContacto = document.getElementById('detClienteContacto');
    if (contContacto) {
        let datosStr = [];
        if (clienteObj.telefono) datosStr.push(`Tel: ${clienteObj.telefono}`);
        if (clienteObj.email) datosStr.push(`Email: ${clienteObj.email}`);
        
        let dirTexto = clienteObj.direccion ? `<br><span style="color:var(--text-main); font-weight:600;">Dir: ${clienteObj.direccion}</span>` : '';
        let mapsBtn = clienteObj.direccion ? ` <button type="button" class="btn-jalea-chip" style="margin-left:6px; font-size:0.7rem; padding: 2px 8px;" onclick="abrirGoogleMaps('${encodeURIComponent(clienteObj.direccion)}')">Abrir Maps</button>` : '';

        const btnEditar = `
            <div style="margin-top:10px;">
                <button type="button" class="btn-jalea-chip active" style="font-size:0.8rem; padding:6px 12px;" onclick="abrirModalEditarCliente()">
                    Editar Datos de Contacto
                </button>
            </div>
        `;

        contContacto.innerHTML = (datosStr.join(' | ') || 'Sin datos de contacto') + dirTexto + mapsBtn + btnEditar;
    }

    const contHist = document.getElementById('detClienteHistorial');
    if (contHist) {
        contHist.innerHTML = '';
        const historial = Array.isArray(clienteObj.historial) ? clienteObj.historial : [];

        if (historial.length === 0) {
            contHist.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:15px 0;">Este cliente no tiene pedidos registrados en el historial.</p>';
            return;
        }

        historial.forEach(h => {
            const estPago = h.estado_pago || h.estado || 'Pendiente';
            const estEntrega = String(h.estado_entrega || h.entrega || '').trim().toLowerCase();

            const colorPago = estPago.toLowerCase() === 'pagado' ? '#16a34a' : '#dc2626';

            // Lógica para renderizar los 3 estados distintos
            let estEntregaBadge = '';
            if (estEntrega.includes('entregad')) {
                estEntregaBadge = '<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">🚚 Entregado</span>';
            } else if (estEntrega.includes('pendien')) {
                estEntregaBadge = '<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">⏳ Por Entregar</span>';
            } else {
                estEntregaBadge = '<span style="background:#f1f5f9; color:#64748b; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">⚠️ Sin Estado</span>';
            }

            const nombreEscapado = (clienteObj.nombre || '').replace(/'/g, "\\'");

            const div = document.createElement('div');
            div.className = 'historial-compra-card';
            div.innerHTML = `
                <div>
                    <strong>Fecha: ${h.fecha || 'Sin fecha'}</strong> 
                    <small style="color:${colorPago}; font-weight:700; margin-left:4px;">[${estPago}]</small> 
                    ${estEntregaBadge}<br>
                    <span style="font-size:0.85rem; color:#334155; margin-top:4px; display:inline-block;">${h.producto || '-'}</span>
                </div>
                <div style="text-align:right;">
                    <strong style="color:var(--text-main); font-size:0.95rem;">$${h.monto || 0}</strong><br>
                    <small style="color:var(--accent); font-weight:700;">${h.cantidad || 0} un.</small><br>
                    ${h.fila ? `<button type="button" class="btn-remove" style="font-size:0.68rem; padding:2px 6px; margin-top:4px;" onclick="eliminarPedido(${h.fila}, '${nombreEscapado}')">Eliminar</button>` : ''}
                </div>
            `;
            contHist.appendChild(div);
        });
    }
}

function abrirModalEditarCliente() {
    if (!clienteDetalleActual) return;
    const clienteObj = clienteDetalleActual;

    Swal.fire({
        title: `Editar Cliente`,
        customClass: {
            popup: 'croiss-swal-popup',
            title: 'croiss-swal-title',
            confirmButton: 'croiss-swal-confirm',
            cancelButton: 'croiss-swal-cancel',
            denyButton: 'croiss-btn-danger'
        },
        buttonsStyling: false,
        html: `
            <div style="text-align: left; margin-top: 14px;">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px;">
                    Nombre del Cliente
                </label>
                <input type="text" id="editNombreInput" class="croiss-swal-input" value="${clienteObj.nombre || ''}" placeholder="Ej: María Pérez">

                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px;">
                    Teléfono
                </label>
                <input type="text" id="editTelInput" class="croiss-swal-input" value="${clienteObj.telefono || ''}" placeholder="099 123 456">

                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px;">
                    Email
                </label>
                <input type="email" id="editEmailInput" class="croiss-swal-input" value="${clienteObj.email || ''}" placeholder="correo@gmail.com">

                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 2px;">
                    Dirección
                </label>
                <input type="text" id="editDirInput" class="croiss-swal-input" value="${clienteObj.direccion || ''}" placeholder="Av. Brasil 2450 Apt 302" style="margin-bottom:0 !important;">
            </div>
        `,
        showCancelButton: true,
        showDenyButton: true,
        confirmButtonText: 'Guardar Cambios',
        denyButtonText: '🗑️ Eliminar Cliente',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
            const nomNuevo = document.getElementById('editNombreInput').value.trim();
            if (!nomNuevo) {
                Swal.showValidationMessage('El nombre del cliente no puede estar vacío.');
                return false;
            }
            return {
                nombre_original: clienteObj.nombre,
                nombre: nomNuevo,
                telefono: document.getElementById('editTelInput').value.trim(),
                email: document.getElementById('editEmailInput').value.trim(),
                direccion: document.getElementById('editDirInput').value.trim()
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();

            try {
                const res = await fetch('/api/cliente/editar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(result.value)
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cliente Actualizado', 'Todos los datos se guardaron correctamente.');
                    cargarClientes();
                    volverASeccionAnterior();
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                console.error("Error al editar cliente:", err);
                Swal.fire('Error', 'No se pudo actualizar la información', 'error');
            }
        } else if (result.isDenied) {
            // Solicitar confirmación de eliminación
            confirmarEliminarCliente(clienteObj.nombre);
        }
    });
}

async function confirmarEliminarCliente(nombreCliente) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">¿Eliminar cliente?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se removerá a <strong style="color:var(--text-main);">${nombreCliente}</strong> de tu lista de contactos/CRM.</p>`,
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        buttonsStyling: false,
        customClass: {
            popup: 'croiss-swal-popup',
            confirmButton: 'croiss-btn-danger',
            cancelButton: 'croiss-swal-cancel'
        }
    }).then(async (resConf) => {
        if (resConf.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();

            try {
                const res = await fetch('/api/cliente/eliminar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ nombre: nombreCliente })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cliente Eliminado', `${nombreCliente} fue removido de tus contactos.`);
                    cargarClientes();
                    volverASeccionAnterior();
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                console.error("Error eliminando cliente:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

function volverASeccionAnterior() {
    cambiarSegmentoCliente(datosClientesGlobal.subOrigen || 'lista');
}

function obtenerExtraRelleno(nombreProducto) {
    if (!nombreProducto) return 0;
    
    // Normaliza el texto: pasa a minúsculas y elimina tildes/diacríticos (ej: "Jamón" -> "jamon")
    const nombre = nombreProducto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    // Detección de Jamón y/o Queso (+$50)
    if (nombre.includes('jamon') || nombre.includes('queso')) {
        return 50;
    }

    // Detección de Dulce de Leche / DDL (+$30)
    if (nombre.includes('dulce de leche') || nombre.includes('ddl') || nombre.includes('dulce')) {
        return 30;
    }

    return 0;
}
	
function calcularPrecioBase(totalCroissants) {
    if (totalCroissants >= 6) return 100;
    if (totalCroissants >= 3) return 110;
    return 140;
}

function agregarAlPedido() {
    const selectEl = document.getElementById('vProductoSelect');
    const prodNombre = selectEl ? selectEl.value.trim() : '';
    const cantInput = document.getElementById('vCantidadItem');
    const cant = cantInput ? (parseInt(cantInput.value) || 1) : 1;

    if (!prodNombre || prodNombre === 'Seleccionar croissant...') {
        Swal.fire('Atencion', 'Selecciona un croissant del menu desplegable primero.', 'warning');
        return;
    }

    carrito.push({
        producto: prodNombre,
        cantidad: cant,
        con_jalea: false,
        precio_unitario: 0,
        subtotal: 0
    });

    if (cantInput) cantInput.value = 1;
    renderizarCarrito();
}

function toggleJaleaItem(index) {
    carrito[index].con_jalea = !carrito[index].con_jalea;
    renderizarCarrito();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderizarCarrito();
}

function renderizarCarrito() {
    const listEl = document.getElementById('cartList');
    const totalEl = document.getElementById('cartTotal');

    if(carrito.length === 0) {
        listEl.innerHTML = '<p style="color: #94a3b8; text-align: center;">El ticket esta vacio</p>';
        totalEl.innerText = '0';
        return;
    }

    const totalCroissantsNormales = carrito.reduce((sum, item) => {
        if (item.producto.toLowerCase().includes('pop')) return sum;
        return sum + item.cantidad;
    }, 0);

    const precioBaseNormales = calcularPrecioBase(totalCroissantsNormales);

    listEl.innerHTML = '';
    let totalGeneral = 0;

    carrito.forEach((item, index) => {
        const esPop = item.producto.toLowerCase().includes('pop');
        let precioUnitario = 0;

        if (esPop) {
            const prodMatch = catalogoProductos.find(p => {
                const nombre = p.Nombre || p.Producto || p.nombre || p.producto || p.Croissant || '';
                return nombre.trim().toLowerCase() === item.producto.trim().toLowerCase();
            });

            if (prodMatch) {
                const rawP = prodMatch['Precio Venta'] !== undefined ? prodMatch['Precio Venta'] : (prodMatch['Precio'] || 0);
                precioUnitario = parseFloat(String(rawP).replace('$', '').replace(',', '.').trim()) || 0;
            }
        } else {
            const extraRelleno = obtenerExtraRelleno(item.producto);
            precioUnitario = precioBaseNormales + extraRelleno;
        }

        const subtotal = precioUnitario * item.cantidad;
        
        item.precio_unitario = precioUnitario;
        item.subtotal = subtotal;

        totalGeneral += subtotal;

        const claseJalea = item.con_jalea ? 'active' : '';
        const textoJalea = item.con_jalea ? 'Con Jalea' : 'Sin Jalea';

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div>
                <strong>${item.cantidad}x ${item.producto}</strong><br>
                <button type="button" class="btn-jalea-chip ${claseJalea}" onclick="toggleJaleaItem(${index})">
                    ${textoJalea}
                </button>
                <small style="color:#64748b; display:block; margin-top:2px;">$${precioUnitario} c/u</small>
            </div>
            <div style="text-align: right;">
                <span style="font-weight: bold; margin-right: 8px;">$${subtotal}</span>
                <button type="button" class="btn-remove" onclick="eliminarDelCarrito(${index})">X</button>
            </div>
        `;
        listEl.appendChild(div);
    });

    totalEl.innerText = totalGeneral;
}

function actualizarMedioPagoSegunEstado() {
    const estadoEl = document.getElementById('vEstado');
    const medioEl = document.getElementById('vMedio');
    if (!estadoEl || !medioEl) return;

    if (estadoEl.value === 'Pendiente') {
        medioEl.value = '-';
    } else if (estadoEl.value === 'Pagado' && medioEl.value === '-') {
        medioEl.value = 'Efectivo';
    }
}

const formFinalizarPedido = document.getElementById('formFinalizarPedido');
if (formFinalizarPedido) {
    formFinalizarPedido.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (typeof carrito === 'undefined' || carrito.length === 0) {
            Swal.fire('Carrito vacio', 'Agrega al menos un producto al pedido.', 'warning');
            return;
        }

        const tInicio = Date.now();
        mostrarCroissLoader();

        const clienteNombre = getInputValueSafe('vCliente', 'Consumidor Final');
        const telCliente = getInputValueSafe('vTelefonoCliente');
        const emailCliente = getInputValueSafe('vEmailCliente');
        const dirCliente = getInputValueSafe('vDireccionCliente');
        const fechaVal = getInputValueSafe('vFecha', hoy);
        const fechaEntregaVal = getInputValueSafe('vFechaEntrega', fechaVal);
        const estadoVal = getInputValueSafe('vEstado', 'Pendiente');
        const medioVal = getInputValueSafe('vMedio', 'Efectivo');

        const totalMonto = carrito.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0);

        const payload = {
            fecha: fechaVal,
            fecha_entrega: fechaEntregaVal,
            cliente: clienteNombre,
            telefono: telCliente,
            email: emailCliente,
            direccion: dirCliente,
            items: carrito,
            monto_total: totalMonto,
            estado: estadoVal,
            medio_pago: medioVal
        };

        try {
            const res = await fetch('/api/venta', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            await esperarAnimacionMinima(tInicio, 2200);

            if (data.status === 'exito') {
                carrito = [];
                renderizarCarrito();
                formFinalizarPedido.reset();
                if(document.getElementById('vFecha')) document.getElementById('vFecha').value = hoy;
                if(document.getElementById('vFechaEntrega')) document.getElementById('vFechaEntrega').value = hoy;

                mostrarCroissExito(
                    'Pedido Registrado!', 
                    emailCliente ? 'Se envio el correo de confirmacion al cliente.' : 'El pedido se guardo correctamente en la agenda.'
                );

                if (typeof cargarAgenda === 'function') cargarAgenda();
                if (typeof cargarStock === 'function') cargarStock();
            } else {
                Swal.fire('Error', data.mensaje || 'Error al guardar pedido', 'error');
            }
        } catch (err) {
            console.error("Error en submit de venta:", err);
            Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
        }
    });
}

const formGasto = document.getElementById('formGasto');
if (formGasto) {
    formGasto.addEventListener('submit', async (e) => {
        e.preventDefault();

        const tInicio = Date.now();
        mostrarCroissLoader();

        const payload = {
            fecha: document.getElementById('gFecha').value,
            categoria: document.getElementById('gCategoria').value,
            descripcion: document.getElementById('gDescripcion').value,
            cantidad: parseFloat(document.getElementById('gCantidad').value) || 1,
            unidad: document.getElementById('gUnidad').value,
            vencimiento: document.getElementById('gVencimiento').value || '',
            monto: document.getElementById('gMonto').value
        };

        try {
            const res = await fetch('/api/gasto', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            await esperarAnimacionMinima(tInicio, 2200);

            if (data.status === 'exito') {
                mostrarCroissExito('Compra / Gasto Registrado!', 'Se actualizo el historial y el stock de insumos.');
                formGasto.reset();
                if(document.getElementById('gFecha')) document.getElementById('gFecha').value = hoy;
                toggleCamposMateriaPrima();
                cargarInsumosYGastos();
            } else {
                Swal.fire('Error', data.mensaje, 'error');
            }
        } catch (err) {
            Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
        }
    });
}

// Inicializacion
cargarStock();
toggleCamposMateriaPrima();