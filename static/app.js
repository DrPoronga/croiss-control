// PRECARGA DE LA IMAGEN EN MEMORIA RAM
const croissImagePreload = new Image();
croissImagePreload.src = '/static/croissant.png';

// Configuración de fechas iniciales
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
let chartGastosCatInstance = null;
let chartEvolucionLineaInstance = null;
let chartSaboresInstance = null;
let chartDiasInstance = null;
let chartFlujoPrincipalInstance = null;
let datosFlujoGlobal = { diario: [], semanal: [] };
let modoFlujoActual = 'diario';
let rankingMesActualGlobal = [];
let ganadoresHistoricosGlobal = [];

// ==========================================
// HELPER DE ANIMACIÓN Y TIEMPOS
// ==========================================
async function esperarAnimacionMinima(tiempoInicio, minMs = 1800) {
    const transcurrido = Date.now() - tiempoInicio;
    if (transcurrido < minMs) {
        await new Promise(resolve => setTimeout(resolve, minMs - transcurrido));
    }
}

function getInputValueSafe(id, defaultVal = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : defaultVal;
}

function formatNombrePrivado(nombreCompleto) {
    if (!nombreCompleto) return '';
    const partes = nombreCompleto.trim().split(/\s+/);
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[1].charAt(0).toUpperCase()}.`;
}

// ==========================================
// DETECTOR INTELIGENTE DE COLUMNAS SHEETS
// ==========================================
function obtenerNombreDesdeObjeto(prod) {
    if (!prod || typeof prod !== 'object') return '';
    if (prod.Nombre) return prod.Nombre.trim();
    if (prod.Producto) return prod.Producto.trim();
    if (prod.nombre) return prod.nombre.trim();
    if (prod.producto) return prod.producto.trim();
    if (prod.Croissant) return prod.Croissant.trim();

    for (let k in prod) {
        const kLower = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (kLower.includes('nombre') || kLower.includes('producto') || kLower.includes('croissant') || kLower.includes('item') || kLower.includes('descripcion')) {
            if (prod[k] && typeof prod[k] === 'string' && prod[k].trim() !== '') {
                return prod[k].trim();
            }
        }
    }
    return '';
}

function obtenerPrecioDesdeObjeto(prod) {
    if (!prod || typeof prod !== 'object') return 0;
    if (prod['Precio Venta'] !== undefined) return prod['Precio Venta'];
    if (prod['Precio'] !== undefined) return prod['Precio'];
    if (prod['precio'] !== undefined) return prod['precio'];

    for (let k in prod) {
        const kLower = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        if (kLower.includes('precio') || kLower.includes('monto') || kLower.includes('valor')) {
            return prod[k];
        }
    }
    return 0;
}

// ==========================================
// CÁLCULOS DE PRECIOS Y CARRITO
// ==========================================
function obtenerExtraRelleno(nombreProducto) {
    if (!nombreProducto) return 0;
    const nombre = nombreProducto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (nombre.includes('jamon') || nombre.includes('queso') || nombre.includes('creme') || nombre.includes('crema')) return 50;
    if (nombre.includes('dulce de leche') || nombre.includes('ddl') || nombre.includes('dulce')) return 30;
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
        Swal.fire('Atención', 'Selecciona un croissant del menú desplegable primero.', 'warning');
        return;
    }

    let salsasArray = [];
    if (prodNombre.toLowerCase().includes('pop')) {
        let numSalsas = prodNombre.toLowerCase().includes('9') ? 1 : 2;
        salsasArray = Array(numSalsas).fill("Dulce de Leche");
    }

    carrito.push({
        producto: prodNombre,
        cantidad: cant,
        con_jalea: false,
        salsas: salsasArray,
        precio_unitario: 0,
        subtotal: 0
    });

    if (cantInput) cantInput.value = 1;
    renderizarCarrito();
}

function actualizarSalsaItem(itemIndex, salsaIndex, valor) {
    if (carrito[itemIndex] && carrito[itemIndex].salsas) {
        carrito[itemIndex].salsas[salsaIndex] = valor;
    }
}

let cuponAplicado = null; // Guarda el cupón activo en el carrito

async function aplicarCuponTienda() {
    const inputCupon = document.getElementById('vInputCupon');
    const codigo = inputCupon ? inputCupon.value.trim().toUpperCase() : '';
    
    if (!codigo) {
        Swal.fire('Atención', 'Ingresá un código de cupón.', 'warning');
        return;
    }

    try {
        const res = await fetch('/api/public/validar_cupon', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo })
        });
        const data = await res.json();

        if (data.status === 'exito') {
            cuponAplicado = data.cupon;
            mostrarCroissExito('¡Cupón Aplicado!', `Descuento del ${data.cupon.tipo === '%' ? data.cupon.valor + '%' : '$' + data.cupon.valor} activado.`);
            renderizarCarrito();
        } else {
            cuponAplicado = null;
            Swal.fire('Error', data.mensaje || 'Cupón inválido', 'error');
            renderizarCarrito();
        }
    } catch (err) {
        Swal.fire('Error', 'No se pudo conectar para validar el cupón.', 'error');
    }
}

function renderizarCarrito() {
    const listEl = document.getElementById('cartList');
    const totalEl = document.getElementById('cartTotal');
    const descuentoSelect = document.getElementById('vDescuento');
    let descuentoPorcentaje = descuentoSelect ? (parseFloat(descuentoSelect.value) || 0) : 0;

    if (carrito.length === 0) {
        listEl.innerHTML = '<p style="color: #94a3b8; text-align: center;">El ticket está vacío</p>';
        totalEl.innerText = '0';
        cuponAplicado = null;
        return;
    }

    const totalCroissantsNormales = carrito.reduce((sum, item) => {
        if (item.producto.toLowerCase().includes('pop')) return sum;
        return sum + item.cantidad;
    }, 0);

    const precioBaseNormales = calcularPrecioBase(totalCroissantsNormales);

    listEl.innerHTML = '';
    let totalGeneralBruto = 0;

    carrito.forEach((item, index) => {
        const esPop = item.producto.toLowerCase().includes('pop');
        let precioUnitario = 0;

        if (esPop) {
            const prodMatch = catalogoProductos.find(p => {
                const nombre = obtenerNombreDesdeObjeto(p);
                return nombre.toLowerCase() === item.producto.trim().toLowerCase();
            });

            if (prodMatch) {
                const rawP = obtenerPrecioDesdeObjeto(prodMatch);
                precioUnitario = parseFloat(String(rawP).replace('$', '').replace(',', '.').trim()) || 0;
            }
        } else {
            const extraRelleno = obtenerExtraRelleno(item.producto);
            precioUnitario = precioBaseNormales + extraRelleno;
        }

        const subtotal = precioUnitario * item.cantidad;
        item.precio_unitario = precioUnitario;
        item.subtotal = subtotal;

        totalGeneralBruto += subtotal;

        const claseJalea = item.con_jalea ? 'active' : '';
        const textoJalea = item.con_jalea ? 'Con Jalea' : 'Sin Jalea';

        let selectorSalsasHtml = '';
        if (esPop) {
            const OpcionesSalsas = ["Dulce de Leche", "Frutilla", "Jalea"];
            let selectores = '';
            for (let i = 0; i < item.salsas.length; i++) {
                const salsaActual = item.salsas[i] || "Dulce de Leche";
                let opcionesHtml = OpcionesSalsas.map(s => `<option value="${s}" ${s === salsaActual ? 'selected' : ''}>${s}</option>`).join('');
                selectores += `
                    <div style="margin-top:4px;">
                        <small style="font-size:0.7rem; font-weight:700; color:#7A6B63;">Salsa ${i + 1}:</small>
                        <select onchange="actualizarSalsaItem(${index}, ${i}, this.value)" style="padding:3px 8px; font-size:0.75rem; border-radius:8px; border:1px solid #D8CFC8; background:#FFFFFF;">
                            ${opcionesHtml}
                        </select>
                    </div>
                `;
            }
            selectorSalsasHtml = `<div style="margin-top:6px; background:#FAF0EB; padding:8px; border-radius:10px; border:1px dashed #C86D28;">${selectores}</div>`;
        }

        const selectorJaleaHtml = !esPop ? `
            <button type="button" class="btn-jalea-chip ${claseJalea}" onclick="toggleJaleaItem(${index})">
                ${textoJalea}
            </button>
        ` : '';

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div>
                <strong>${item.cantidad}x ${item.producto}</strong><br>
                ${selectorJaleaHtml}
                ${selectorSalsasHtml}
                <small style="color:#64748b; display:block; margin-top:4px;">$${precioUnitario} c/u</small>
            </div>
            <div style="text-align: right;">
                <span style="font-weight: bold; margin-right: 8px;">$${subtotal}</span>
                <button type="button" class="btn-remove" onclick="eliminarDelCarrito(${index})">X</button>
            </div>
        `;
        listEl.appendChild(div);
    });

    // Cálculo de descuento por cupón o manual
    let montoDescuento = Math.round(totalGeneralBruto * (descuentoPorcentaje / 100));
    let etiquetaDescuento = `-${descuentoPorcentaje}% aplicado`;

    if (cuponAplicado) {
        if (cuponAplicado.tipo === '%') {
            montoDescuento = Math.round(totalGeneralBruto * (cuponAplicado.valor / 100));
            etiquetaDescuento = `Cupón ${cuponAplicado.codigo} (-${cuponAplicado.valor}%)`;
        } else {
            montoDescuento = cuponAplicado.valor;
            etiquetaDescuento = `Cupón ${cuponAplicado.codigo} (-$${cuponAplicado.valor})`;
        }
    }

    const totalFinal = Math.max(0, totalGeneralBruto - montoDescuento);

    // Formulario de ingreso de cupón dentro del carrito
    const divCupon = document.createElement('div');
    divCupon.style.cssText = 'margin-top: 12px; padding-top: 10px; border-top: 1px dashed #E2D9D3; display: flex; gap: 6px;';
    divCupon.innerHTML = `
        <input type="text" id="vInputCupon" placeholder="Código de cupón..." value="${cuponAplicado ? cuponAplicado.codigo : ''}" class="croiss-swal-input" style="margin:0 !important; font-size:0.8rem !important; padding:6px 10px !important; text-transform:uppercase;">
        <button type="button" class="btn-jalea-chip active" style="margin:0; padding:6px 12px; font-size:0.75rem;" onclick="aplicarCuponTienda()">Aplicar</button>
    `;
    listEl.appendChild(divCupon);

    if (montoDescuento > 0) {
        totalEl.innerHTML = `
            <span style="text-decoration: line-through; color: #94a3b8; font-size: 0.9rem; margin-right: 6px;">$${totalGeneralBruto}</span>
            <span style="color: #16a34a; font-size: 1.3rem; font-weight: 800;">$${totalFinal}</span>
            <small style="font-size: 0.75rem; color: #16a34a; font-weight: 700; display: block;">(${etiquetaDescuento})</small>
        `;
    } else {
        totalEl.innerText = totalFinal;
    }
}
function toggleJaleaItem(index) {
    carrito[index].con_jalea = !carrito[index].con_jalea;
    renderizarCarrito();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderizarCarrito();
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

// ==========================================
// CORTINAS DE CARGA Y NOTIFICACIONES
// ==========================================
function mostrarCroissLoader() {
    if (!croissImagePreload.src || croissImagePreload.src === '') {
        croissImagePreload.src = '/static/croissant.png';
    }

    Swal.fire({
        html: `<div class="croiss-canvas-container"><canvas id="croissBiteCanvas" width="180" height="140"></canvas></div>`,
        showConfirmButton: false,
        allowOutsideClick: false,
        background: 'transparent',
        customClass: { popup: 'croiss-swal-popup-transparent' },
        didOpen: () => {
            const popup = Swal.getPopup();
            if (popup) popup.setAttribute('data-is-loader', 'true');
            iniciarAnimacionCanvasCroissant();
        },
        willClose: () => {
            if (croissAnimFrameId) cancelAnimationFrame(croissAnimFrameId);
        }
    });
}

function cerrarCroissLoaderSeguro() {
    const popup = Swal.getPopup();
    if (popup && popup.getAttribute('data-is-loader') === 'true') {
        Swal.close();
    }
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

        for (let i = 0; i < 5; i++) {
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
        customClass: { popup: 'croiss-swal-popup' }
    });
}

function abrirGoogleMaps(direccion) {
    if (!direccion) {
        Swal.fire('Sin Dirección', 'No hay una dirección registrada para este cliente/pedido.', 'info');
        return;
    }
    
    // Abre Waze directamente en la app del sistema sin crear pestañas secundarias
    window.location.href = `https://www.waze.com/ul?q=${encodeURIComponent(decodeURIComponent(direccion))}&navigate=yes`;
}

function abrirGoogleMapsIngresado() {
    abrirGoogleMaps(getInputValueSafe('vDireccionCliente'));
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
                toast: true, position: 'top-end', icon: 'info',
                title: `Datos de ${clienteEncontrado.nombre} cargados`,
                showConfirmButton: false, timer: 2000, background: '#FAF0EB', color: '#2D1E18'
            });
        }
    }
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

            const existeCreme = catalogoProductos.some(p => {
                const nom = obtenerNombreDesdeObjeto(p).toLowerCase();
                return nom.includes('creme') || nom.includes('crema');
            });

            if (!existeCreme) {
                const itemCreme = {
                    "Nombre": "Croiss a la Creme",
                    "Precio Venta": 190
                };

                const idxDulce = catalogoProductos.findIndex(p => {
                    const nom = obtenerNombreDesdeObjeto(p).toLowerCase();
                    return nom.includes('dulce') || nom.includes('ddl');
                });

                if (idxDulce !== -1) {
                    catalogoProductos.splice(idxDulce + 1, 0, itemCreme);
                } else {
                    catalogoProductos.push(itemCreme);
                }
            }

            renderizarMenuYStock();
        }
    } catch (err) {
        console.error("Error al cargar stock:", err);
    } finally {
        isFetchingStock = false;
    }
}

function abrirModalEditarCongeladosDirecto() {
    const croissTxt = document.getElementById('cantCroissCongelados') ? document.getElementById('cantCroissCongelados').innerText.replace(' un.', '').trim() : '0';
    const masasTxt = document.getElementById('cantSobrevendidos') ? document.getElementById('cantSobrevendidos').innerText.replace(' masas', '').trim() : '0';

    Swal.fire({
        title: 'Fijar Stock de Producción',
        html: `
            <div style="text-align: left; margin-top: 10px; font-size: 0.88rem;">
                <div style="margin-bottom: 12px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 4px; color: var(--text-main);">🧊 Croissants Congelados (listos/sueltos):</label>
                    <input type="number" id="inputFijarCongelados" class="croiss-swal-input" value="${parseInt(croissTxt) || 0}" min="0" placeholder="Ej: 5">
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 4px; color: var(--accent);">🥣 Masas en Heladera (1 masa = 10 croiss):</label>
                    <input type="number" id="inputFijarMasas" class="croiss-swal-input" value="${parseInt(masasTxt) || 0}" min="0" placeholder="Ej: 2">
                </div>
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'Guardar Stock', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' },
        preConfirm: () => {
            const c = parseInt(document.getElementById('inputFijarCongelados').value);
            const m = parseInt(document.getElementById('inputFijarMasas').value);
            if (isNaN(c) || c < 0 || isNaN(m) || m < 0) {
                Swal.showValidationMessage('Ingresa valores válidos mayores o iguales a 0.');
                return false;
            }
            return { congelados: c, masas: m };
        }
    }).then(async (res) => {
        if (res.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const r = await fetch('/api/stock/congelados/fijar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(res.value)
                });
                const data = await r.json();
                await esperarAnimacionMinima(tInicio, 1800);

                cerrarCroissLoaderSeguro();

                if (data.status === 'exito') {
                    actualizarUIStockCongelados(data);
                    mostrarCroissExito('Stock Actualizado', `Fijados: ${data.congelados} croiss + ${data.masas} masa(s).`);
                } else { 
                    Swal.fire('Error', data.mensaje || 'Error actualizando stock', 'error'); 
                }
            } catch (err) { 
                cerrarCroissLoaderSeguro();
                Swal.fire('Error', 'No se pudo actualizar el stock en la planilla', 'error'); 
            }
        }
    });
}

function actualizarUIStockCongelados(data) {
    const elCong = document.getElementById('cantCroissCongelados');
    const elSobrevendidos = document.getElementById('cantSobrevendidos');
    const elMasas = document.getElementById('cantMasasPendientes');
    const boxContainer = document.getElementById('boxSobrevendidosContainer');
    const lblTitulo = document.getElementById('lblSobrevendidosTitulo');

    const croiss = data.congelados !== undefined ? data.congelados : 0;
    const masas = data.masas !== undefined ? data.masas : 0;
    const capTotal = data.capacidad_total !== undefined ? data.capacidad_total : (croiss + (masas * 10));

    if (elCong) elCong.innerText = `${croiss} un.`;
    if (elSobrevendidos) elSobrevendidos.innerText = `${masas} masas`;
    if (elMasas) elMasas.innerText = `(Cap. Total: ${capTotal} croiss)`;

    if (boxContainer) {
        if (capTotal <= 0) {
            boxContainer.style.background = '#FEF2F2';
            boxContainer.style.borderColor = '#FCA5A5';
            if (lblTitulo) {
                lblTitulo.style.color = '#991B1B';
                lblTitulo.innerText = 'Sin Capacidad 🚫';
            }
            if (elSobrevendidos) elSobrevendidos.style.color = '#DC2626';
            if (elMasas) elMasas.style.color = '#B91C1C';
        } else {
            boxContainer.style.background = '#F0FDF4';
            boxContainer.style.borderColor = '#DCFCE7';
            if (lblTitulo) {
                lblTitulo.style.color = '#166534';
                lblTitulo.innerText = 'Masas en Heladera 🥣';
            }
            if (elSobrevendidos) elSobrevendidos.style.color = '#15803D';
            if (elMasas) elMasas.style.color = '#16A34A';
        }
    }
}

function abrirModalEditarPopDirecto() {
    const popTxt = document.getElementById('cantPopCongelados') ? document.getElementById('cantPopCongelados').innerText.replace(' un.', '').trim() : '0';
    const masasTxt = document.getElementById('cantMasasPop') ? document.getElementById('cantMasasPop').innerText.replace(' masas', '').trim() : '0';

    Swal.fire({
        title: 'Fijar Stock de Pop Croiss',
        html: `
            <div style="text-align: left; margin-top: 10px; font-size: 0.88rem;">
                <div style="margin-bottom: 12px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 4px; color: #B45309;">🍿 Pop Croiss Congelados (unidades sueltas):</label>
                    <input type="number" id="inputFijarPop" class="croiss-swal-input" value="${parseInt(popTxt) || 0}" min="0" placeholder="Ej: 27">
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="font-weight: 700; display: block; margin-bottom: 4px; color: var(--accent);">🥣 Masas Pop en Heladera (1 masa = 30 pop):</label>
                    <input type="number" id="inputFijarMasasPop" class="croiss-swal-input" value="${parseInt(masasTxt) || 0}" min="0" placeholder="Ej: 1">
                </div>
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'Guardar Stock Pop', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' },
        preConfirm: () => {
            const p = parseInt(document.getElementById('inputFijarPop').value);
            const m = parseInt(document.getElementById('inputFijarMasasPop').value);
            if (isNaN(p) || p < 0 || isNaN(m) || m < 0) {
                Swal.showValidationMessage('Ingresa valores válidos mayores o iguales a 0.');
                return false;
            }
            return { congelados: p, masas: m };
        }
    }).then(async (res) => {
        if (res.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const r = await fetch('/api/stock/pop/fijar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(res.value)
                });
                const data = await r.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    cargarStockPop();
                    mostrarCroissExito('Stock Pop Fijado', `Fijados: ${data.pop_congelados} Pop Croiss.`);
                } else { Swal.fire('Error', data.mensaje || 'Error actualizando stock pop', 'error'); }
            } catch (err) { 
                Swal.fire('Error', 'No se pudo actualizar el stock Pop', 'error'); 
            } finally {
                cerrarCroissLoaderSeguro();
            }
        }
    });
}

function abrirModalSumarPop() {
    Swal.fire({
        title: 'Sumar Pop Croiss al Freezer',
        customClass: { popup: 'croiss-swal-popup', title: 'croiss-swal-title', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' },
        buttonsStyling: false,
        html: `<div style="text-align: left; margin-top: 14px;"><label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Cantidad de Pop Croiss preparados (unidades sueltas)</label><input type="number" id="inputSumarPop" class="croiss-swal-input" value="9" min="1" placeholder="Ej: 27"></div>`,
        showCancelButton: true, confirmButtonText: '+ Sumar Pop', cancelButtonText: 'Cancelar', focusConfirm: false,
        preConfirm: () => {
            const cant = document.getElementById('inputSumarPop').value;
            if (!cant || parseInt(cant) <= 0) { Swal.showValidationMessage('Ingresá una cantidad válida.'); return false; }
            return parseInt(cant);
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/stock/pop', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ congelados: result.value }) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    cargarStockPop();
                    mostrarCroissExito('Pop Agregados!', `Se sumaron +${result.value} unidades de Pop Croiss.`);
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        }
    });
}

// ==========================================
// BALANCE Y MÉTRICAS DE VENTAS
// ==========================================
async function cargarBalance() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const elFilter = document.getElementById('bMesFilter');
        const mesVal = elFilter ? elFilter.value : hoy.substring(0, 7);
        let url = `/api/balance?mes=${mesVal}`;

        const res = await fetch(url);
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);

        if(data.status === 'exito') {
            rankingMesActualGlobal = data.ranking_mes_actual || [];
            ganadoresHistoricosGlobal = data.ganadores_por_mes || [];

            datosFlujoGlobal.diario = data.flujo_diario_mes || [];
            datosFlujoGlobal.semanal = data.flujo_semanal_historico || [];
            
            renderizarGraficoFlujoPrincipal();

            const elCroissMes = document.getElementById('bTotalCroissMes');
            const elCroissHist = document.getElementById('bTotalCroissHist');
            if (elCroissMes) elCroissMes.innerHTML = `${data.total_croissants_mes} cl.<br><span style="font-size: 0.9rem; color: #D97706;">${data.total_pop_mes} pops</span>`;
            if (elCroissHist) elCroissHist.innerHTML = `${data.total_croissants_historico} cl.<br><span style="font-size: 0.9rem; color: #D97706;">${data.total_pop_historico} pops</span>`;

            const elIng = document.getElementById('bIngresos');
            const elCost = document.getElementById('bCostos');
            const elGast = document.getElementById('bGastos');
            const elTick = document.getElementById('bTicketPromedio');
            if (elIng) elIng.innerText = `$${data.ingresos}`;
            if (elCost) elCost.innerText = `$${data.costos_produccion}`;
            if (elGast) elGast.innerText = `$${data.gastos_varios}`;
            if (elTick) elTick.innerText = `$${data.ticket_promedio}`;

            const descuentosEl = document.getElementById('bDescuentos');
            if (descuentosEl) {
                descuentosEl.innerText = `-$${data.total_descuentos || 0}`;
            }
            if (data.origen_ventas) {
                const web = data.origen_ventas.web || { pedidos: 0, croissants: 0, pops: 0, monto: 0 };
                const manual = data.origen_ventas.manual || { pedidos: 0, croissants: 0, pops: 0, monto: 0 };

                const elWebMonto = document.getElementById('bWebMonto');
                const elWebDet = document.getElementById('bWebDetalle');
                const elManMonto = document.getElementById('bManualMonto');
                const elManDet = document.getElementById('bManualDetalle');

                if (elWebMonto) elWebMonto.innerText = `$${web.monto}`;
                if (elWebDet) elWebDet.innerText = `${web.pedidos} ped. (${web.croissants} cl. | ${web.pops} pop)`;
                if (elManMonto) elManMonto.innerText = `$${manual.monto}`;
                if (elManDet) elManDet.innerText = `${manual.pedidos} ped. (${manual.croissants} cl. | ${manual.pops} pop)`;
            }
            const gananciaEl = document.getElementById('bGanancia');
            if (gananciaEl) {
                gananciaEl.innerText = `$${data.ganancia_neta}`;
                gananciaEl.style.color = data.ganancia_neta < 0 ? "#ef4444" : "#16a34a";
            }

            renderizarGraficoGastosCategoria(data.gastos_por_categoria);

            const proy = data.proyeccion;
            const txtCroiss = document.getElementById('txtProyeccionCroiss');
            const txtIng = document.getElementById('txtProyeccionIngresos');

            if (txtCroiss && txtIng) {
                if (proy && proy.es_mes_actual) {
                    txtCroiss.innerText = `~${proy.croissants_estimados} Clásicos | ~${proy.pops_estimados} Pops`;
                    txtIng.innerText = `Ingresos estimados: $${proy.ingresos_estimados} al cierre del mes`;
                } else {
                    txtCroiss.innerText = `${data.total_croissants_mes} Clásicos | ${data.total_pop_mes} Pops Vendidos`;
                    txtIng.innerText = `Total final del período cerrado`;
                }
            }

            const contTop = document.getElementById('boxTopClientesBalance');
            if (contTop && data.top_clientes) {
                const topM = data.top_clientes.mes;
                const topH = data.top_clientes.historico;

                contTop.innerHTML = `
                    <div style="display:flex; gap:10px; margin-bottom:16px;">
                        <div onclick="verModalClientesMes()" style="flex:1; background:#FAF0EB; border:1px solid #F7DFC8; border-radius:14px; padding:12px; cursor:pointer; transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                            <small style="color:var(--accent); font-weight:800; text-transform:uppercase; font-size:0.68rem;">👑 LÍDER DEL MES</small>
                            <div style="font-weight:800; font-size:0.95rem; color:#2D1E18; margin-top:2px;">${topM ? topM.nombre : 'Sin ventas'}</div>
                            <small style="color:#64748b;">${topM ? topM.croissants : 0} croiss. ($${topM ? topM.gastado : 0})</small>
                            <div style="font-size:0.68rem; color:var(--accent); font-weight:700; margin-top:6px;">🔍 Toca para ver lista completa</div>
                        </div>
                        <div onclick="verModalGanadoresHistoricos()" style="flex:1; background:#F0FDF4; border:1px solid #DCFCE7; border-radius:14px; padding:12px; cursor:pointer; transition:transform 0.15s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                            <small style="color:#16A34A; font-weight:800; text-transform:uppercase; font-size:0.68rem;">🏆 LÍDER HISTÓRICO</small>
                            <div style="font-weight:800; font-size:0.95rem; color:#2D1E18; margin-top:2px;">${topH ? topH.nombre : 'Sin ventas'}</div>
                            <small style="color:#16A34A; font-weight:700;">${topH ? topH.croissants : 0} croiss. ($${topH ? topH.gastado : 0})</small>
                            <div style="font-size:0.68rem; color:#16A34A; font-weight:700; margin-top:6px;">🔍 Ver ganadores por mes</div>
                        </div>
                    </div>
                `;
            }

            const elJalea = document.getElementById('txtPorcentajeJalea');
            if (elJalea && data.stats_jalea) {
                elJalea.innerText = `${data.stats_jalea.porcentaje}% (${data.stats_jalea.con_jalea} un.)`;
            }

            const contRank = document.getElementById('listaRankingSabores');
            if (contRank) {
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
            }

            renderizarGraficoSabores(data.ranking_sabores);
            renderizarGraficoDias(data.dias_semana);
            renderizarGraficoEvolucionLinea(data.historico_meses);

            const contEvolucion = document.getElementById('listaEvolucionMeses');
            if (contEvolucion) {
                contEvolucion.innerHTML = '';
                data.historico_meses.forEach(m => {
                    const esPositivo = m.ganancia_neta >= 0;
                    const colorGanancia = esPositivo ? '#16a34a' : '#dc2626';

                    const div = document.createElement('div');
                    div.className = 'ios-cliente-row compact';
                    div.style.cursor = 'default';
                    div.innerHTML = `
                        <div>
                            <strong>Fecha: ${m.mes_key}</strong> <small style="color:var(--text-muted);">(${m.croissants} croiss. / ${m.pedidos} pedidos)</small><br>
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
    } catch(err) {
        console.error("Error al cargar balance:", err);
    } finally {
        cerrarCroissLoaderSeguro();
    }
}

// FUNCIONES PARA MOSTRAR LOS MODALES AL HACER CLIC
function verModalClientesMes() {
    if (!rankingMesActualGlobal || rankingMesActualGlobal.length === 0) {
        Swal.fire('Sin Compras', 'No hay compras registradas en este período.', 'info');
        return;
    }

    let htmlLista = '';
    const medallas = ['🥇', '🥈', '🥉'];
    rankingMesActualGlobal.forEach((c, idx) => {
        const medalla = medallas[idx] || `#${idx + 1}`;
        htmlLista += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#FAF9F8; border:1px solid var(--border-color); border-radius:12px; margin-bottom:6px; text-align:left;">
                <div>
                    <span style="font-size:0.95rem; margin-right:4px;">${medalla}</span>
                    <strong style="color:var(--text-main); font-size:0.9rem;">${c.nombre}</strong>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${c.pedidos || 1} pedido(s)</div>
                </div>
                <div style="text-align:right;">
                    <strong style="color:var(--accent); font-size:0.95rem;">${c.croissants} un.</strong>
                    <div style="font-size:0.75rem; color:#16A34A; font-weight:700;">$${c.gastado}</div>
                </div>
            </div>
        `;
    });

    Swal.fire({
        title: '🥐 Ranking de Compras del Mes',
        html: `
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Compradores del mes seleccionado:</p>
            <div style="max-height:320px; overflow-y:auto; padding-right:4px;">
                ${htmlLista}
            </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' }
    });
}

function verModalGanadoresHistoricos() {
    if (!ganadoresHistoricosGlobal || ganadoresHistoricosGlobal.length === 0) {
        Swal.fire('Sin Datos', 'Aún no hay historial de ventas suficiente.', 'info');
        return;
    }

    let htmlLista = '';
    ganadoresHistoricosGlobal.forEach(g => {
        htmlLista += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; background:#F0FDF4; border:1px solid #DCFCE7; border-radius:12px; margin-bottom:6px; text-align:left;">
                <div>
                    <span style="font-size:0.72rem; font-weight:800; color:#166534; text-transform:uppercase; display:block;">📅 ${g.mes_key}</span>
                    <strong style="color:var(--text-main); font-size:0.95rem;">👑 ${g.ganador}</strong>
                </div>
                <div style="text-align:right;">
                    <strong style="color:#15803D; font-size:0.95rem;">${g.croissants} croiss.</strong>
                    <div style="font-size:0.75rem; color:#16A34A; font-weight:700;">$${g.gastado}</div>
                </div>
            </div>
        `;
    });

    Swal.fire({
        title: '🏆 Ganadores de Cada Mes',
        html: `
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Cliente N° 1 de cada mes histórico:</p>
            <div style="max-height:320px; overflow-y:auto; padding-right:4px;">
                ${htmlLista}
            </div>
        `,
        showConfirmButton: true,
        confirmButtonText: 'Cerrar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' }
    });
}

function renderizarGraficoGastosCategoria(gastosCat) {
    const ctx = document.getElementById('chartGastosCatCanvas');
    if (!ctx) return;
    if (chartGastosCatInstance) chartGastosCatInstance.destroy();
    if (!gastosCat || gastosCat.length === 0) return;

    chartGastosCatInstance = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: gastosCat.map(g => g.categoria),
            datasets: [{
                data: gastosCat.map(g => g.monto),
                backgroundColor: ['#DC2626', '#EA580C', '#D97706', '#0284C7', '#64748B']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } }
        }
    });
}

function renderizarGraficoEvolucionLinea(historico) {
    const ctx = document.getElementById('chartEvolucionLineaCanvas');
    if (!ctx) return;
    if (chartEvolucionLineaInstance) chartEvolucionLineaInstance.destroy();
    if (!historico || historico.length === 0) return;

    chartEvolucionLineaInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: historico.map(h => h.mes_key),
            datasets: [
                {
                    label: 'Ingresos ($)',
                    data: historico.map(h => h.ingresos),
                    borderColor: '#16A34A',
                    backgroundColor: 'rgba(22, 163, 74, 0.1)',
                    tension: 0.3,
                    fill: true
                },
                {
                    label: 'Ganancia Neta ($)',
                    data: historico.map(h => h.ganancia_neta),
                    borderColor: '#C86D28',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5],
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

function renderizarGraficoSabores(ranking) {
    const ctx = document.getElementById('chartSaboresCanvas');
    if (!ctx) return;
    if (chartSaboresInstance) chartSaboresInstance.destroy();
    if (!ranking || ranking.length === 0) return;

    chartSaboresInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ranking.map(r => r.sabor),
            datasets: [{
                data: ranking.map(r => r.cantidad),
                backgroundColor: ['#C86D28', '#2D1E18', '#D97706', '#9A4D15', '#7A6B63', '#CBD5E1']
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } }
        }
    });
}

function renderizarGraficoDias(diasObj) {
    const ctx = document.getElementById('chartDiasCanvas');
    if (!ctx) return;
    if (chartDiasInstance) chartDiasInstance.destroy();
    if (!diasObj) return;

    chartDiasInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(diasObj),
            datasets: [{
                label: 'Croissants Entregados',
                data: Object.values(diasObj),
                backgroundColor: '#C86D28',
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
        }
    });
}

function cambiarSegmentoBalance(segmento) {
    const btnBal = document.getElementById('segBtnBalance');
    const btnSab = document.getElementById('segBtnSabores');
    const btnEvo = document.getElementById('segBtnEvolucion');
    if (btnBal) btnBal.classList.toggle('active', segmento === 'balance');
    if (btnSab) btnSab.classList.toggle('active', segmento === 'sabores');
    if (btnEvo) btnEvo.classList.toggle('active', segmento === 'evolucion');
    
    const subBal = document.getElementById('subSecBalance');
    const subSab = document.getElementById('subSecSabores');
    const subEvo = document.getElementById('subSecEvolucion');
    if (subBal) subBal.classList.toggle('active', segmento === 'balance');
    if (subSab) subSab.classList.toggle('active', segmento === 'sabores');
    if (subEvo) subEvo.classList.toggle('active', segmento === 'evolucion');
}

function cambiarModoFlujoPrincipal(modo) {
    modoFlujoActual = modo;
    const btnDiario = document.getElementById('btnFlujoDiario');
    const btnSemanal = document.getElementById('btnFlujoSemanal');

    if (btnDiario && btnSemanal) {
        btnDiario.classList.toggle('active', modo === 'diario');
        btnSemanal.classList.toggle('active', modo === 'semanal');
    }

    renderizarGraficoFlujoPrincipal();

    const tarjetaChart = document.getElementById('cardFlujoPrincipal');
    if (tarjetaChart) {
        tarjetaChart.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

function renderizarGraficoFlujoPrincipal() {
    const ctx = document.getElementById('chartFlujoPrincipalCanvas');
    if (!ctx) return;

    if (chartFlujoPrincipalInstance) {
        chartFlujoPrincipalInstance.destroy();
    }

    const esDiario = modoFlujoActual === 'diario';
    const listaDatos = esDiario ? datosFlujoGlobal.diario : datosFlujoGlobal.semanal;

    const tituloEl = document.getElementById('tituloFlujoPrincipal');
    const subtituloEl = document.getElementById('subtituloFlujoPrincipal');

    if (tituloEl) tituloEl.innerText = esDiario ? 'Flujo Diario de Ventas (Mes)' : 'Flujo Semanal Histórico';
    if (subtituloEl) subtituloEl.innerText = esDiario ? 'Evolución día por día en el período seleccionado' : 'Tendencia de croissants vendidos por semana';

    if (!listaDatos || listaDatos.length === 0) return;

    const etiquetas = listaDatos.map(d => d.etiqueta);
    const valoresCroiss = listaDatos.map(d => d.croissants);
    const valoresMontos = listaDatos.map(d => d.monto);

    const chartCtx = ctx.getContext('2d');
    const gradiente = chartCtx.createLinearGradient(0, 0, 0, 300);
    if (esDiario) {
        gradiente.addColorStop(0, 'rgba(200, 109, 40, 0.35)');
        gradiente.addColorStop(1, 'rgba(200, 109, 40, 0.02)');
    } else {
        gradiente.addColorStop(0, 'rgba(45, 30, 24, 0.35)');
        gradiente.addColorStop(1, 'rgba(45, 30, 24, 0.02)');
    }

    chartFlujoPrincipalInstance = new Chart(ctx, {
        type: esDiario ? 'bar' : 'line',
        data: {
            labels: etiquetas,
            datasets: [{
                label: 'Croissants',
                data: valoresCroiss,
                montosExtra: valoresMontos,
                backgroundColor: esDiario ? '#C86D28' : gradiente,
                borderColor: esDiario ? '#9A4D15' : '#2D1E18',
                borderWidth: esDiario ? 0 : 3,
                borderRadius: esDiario ? 6 : 0,
                fill: !esDiario,
                tension: 0.3,
                pointBackgroundColor: '#C86D28',
                pointBorderColor: '#FFFFFF',
                pointBorderWidth: 2,
                pointRadius: esDiario ? 0 : 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#2D1E18',
                    titleFont: { size: 13, weight: 'bold' },
                    bodyFont: { size: 12 },
                    padding: 12,
                    cornerRadius: 12,
                    displayColors: false,
                    callbacks: {
                        title: function(items) {
                            return items[0].label;
                        },
                        label: function(context) {
                            const cant = context.raw || 0;
                            const monto = context.dataset.montosExtra[context.dataIndex] || 0;
                            return [
                                `🥐 Vendidos: ${cant} un.`,
                                `💵 Facturado: $${monto}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10, weight: '600' }, color: '#7A6B63' }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: 'rgba(45, 30, 24, 0.06)' },
                    ticks: { precision: 0, font: { size: 10, weight: '600' }, color: '#7A6B63' }
                }
            }
        }
    });
}

// ==========================================
// AGENDA Y MODAL EDICIÓN DE PEDIDOS
// ==========================================
async function cargarTodaLaSeccionAgenda(mostrarLoader = true) {
    const tInicio = Date.now();
    if (mostrarLoader) mostrarCroissLoader();

    try {
        await Promise.all([
            cargarCuentas(false),
            cargarAgenda(false)
        ]);
        if (mostrarLoader) await esperarAnimacionMinima(tInicio, 1800);
    } catch (err) {
        console.error("Error cargando sección Agenda:", err);
    } finally {
        if (mostrarLoader) cerrarCroissLoaderSeguro();
    }
}

async function cargarAgenda(conLoader = true) {
    const contenedor = document.getElementById('listaAgenda');
    if(!contenedor) return;

    const tInicio = Date.now();
    if (conLoader) mostrarCroissLoader();

    try {
        const res = await fetch('/api/agenda');
        const data = await res.json();

        if (conLoader) await esperarAnimacionMinima(tInicio, 1800);

        if(data.status === 'exito') {
            contenedor.innerHTML = '';
            agendaGlobalData = data.agenda || [];
            const primerDiaConPedidosIdx = agendaGlobalData.findIndex(d => d.pedidos && d.pedidos.length > 0);

            agendaGlobalData.forEach((dia, idxDia) => {
                const total = dia.total_croissants;
                const limite = 35;
                const porcentaje = Math.min(100, Math.round((total / limite) * 100));

                let claseBadge = total >= 35 ? 'badge-full' : (total >= 25 ? 'badge-warning' : 'badge-ok');
                let htmlPedidos = '';

                if(!dia.pedidos || dia.pedidos.length === 0) {
                    htmlPedidos = '<p style="font-size:0.85rem; color:#94a3b8; font-style:italic; padding:8px 0;">Sin pedidos pendientes para este día.</p>';
                } else {
                    dia.pedidos.forEach(p => {
                        const esPagado = (p.estado || '').toLowerCase() === 'pagado';
                        const badgePago = esPagado ? '<span style="color:#16a34a; font-weight:700;">Pagado</span>' : '<span style="color:#dc2626; font-weight:700;">Pendiente</span>';
                        
                        const btnMaps = p.direccion ? `<button type="button" class="btn-jalea-chip" style="font-size:0.72rem; padding: 3px 8px;" onclick="abrirGoogleMaps('${encodeURIComponent(p.direccion)}')">Maps</button>` : '';
                        
                        const btnRecordatorio = (!esPagado && p.email) ? `<button type="button" class="btn-jalea-chip" style="background:#FEF3C7; color:#B45309; border-color:#FDE68A; font-size:0.72rem; padding: 3px 8px;" onclick="enviarRecordatorioPago(${p.fila}, '${p.cliente}')">📩 Recordar Pago</button>` : '';

                        let infoContacto = [];
                        if (p.telefono) infoContacto.push(`Tel: ${p.telefono}`);
                        if (p.email) infoContacto.push(`Email: ${p.email}`);
                        let strContacto = infoContacto.length > 0 ? `<div style="font-size:0.78rem; color:#64748b; margin-top:2px;">${infoContacto.join(' | ')}</div>` : '';

                        const bloqueNota = p.notas ? `
                            <div style="margin-top:4px; font-size:0.8rem; color:var(--accent); font-weight:700; background:#FAF0EB; border:1px solid #F7DFC8; padding:4px 8px; border-radius:8px; display:inline-block;">
                                📝 Nota: ${p.notas}
                            </div>
                        ` : '';

                        htmlPedidos += `
                            <div style="background:#FAF9F8; border:1px solid var(--border-color); border-radius:14px; padding:12px; margin-bottom:10px;">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                                    <div>
                                        <strong style="font-size:0.95rem; color:var(--text-main);">${p.cliente}</strong>
                                        <small style="margin-left:6px;">(${badgePago})</small>
                                        ${strContacto}
                                        ${p.direccion ? `<div style="font-size:0.8rem; color:#475569; margin-top:3px;">Dir: ${p.direccion}</div>` : ''}
                                        ${bloqueNota}
                                    </div>
                                    <div style="text-align:right;">
                                        <span style="font-weight:800; color:#d97706; font-size:1rem;">${p.cantidad} un.</span>
                                    </div>
                                </div>
                                <div style="margin-top:8px; padding-top:8px; border-top:1px dashed #E2D9D3; display:flex; justify-content:space-between; align-items:center;">
                                    <span style="font-size:0.85rem; color:#334155; font-weight:600;">${p.descripcion}</span>
                                    <div style="display:flex; gap:6px; align-items:center;">
                                        ${btnRecordatorio}
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
                const estaAbierto = (idxDia === primerDiaConPedidosIdx);

                card.innerHTML = `
                    <div class="agenda-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="cursor:pointer; flex:1;" onclick="toggleExpandirDia('${idDetalle}')">
                            <span class="agenda-titulo">
                                <span id="arrow-${idDetalle}" style="display:inline-block; transition:transform 0.2s; transform: ${estaAbierto ? 'rotate(90deg)' : 'rotate(0deg)'};">></span> ${dia.nombre_dia}
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
                    <div id="${idDetalle}" style="display:${estaAbierto ? 'block' : 'none'}; margin-top: 14px;">
                        ${htmlPedidos}
                    </div>
                `;
                contenedor.appendChild(card);
            });
        }
    } catch (err) {
        console.error("Error al cargar la agenda:", err);
        contenedor.innerHTML = '<p style="color:red; text-align:center;">Error al cargar la agenda.</p>';
    } finally {
        if (conLoader) cerrarCroissLoaderSeguro();
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
            items.push({ cantidad: parseInt(match[1]) || 1, producto: match[2].trim(), con_jalea: conJalea });
        } else {
            items.push({ cantidad: 1, producto: sinJaleaStr, con_jalea: conJalea });
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
                let name = obtenerNombreDesdeObjeto(p);
                let nameLower = (name || '').toLowerCase();
                if (name && !nameLower.includes('congelado') && !nameLower.includes('sobrevendido') && !nameLower.includes('masa')) {
                    let selected = name.toLowerCase().trim() === item.producto.toLowerCase().trim() ? 'selected' : '';
                    optionsHtml += `<option value="${name}" ${selected}>${name}</option>`;
                }
            });
        }

        let selectorProducto = optionsHtml ? `
            <select onchange="actualizarProdEdicion(${idx}, this.value)" class="croiss-swal-input" style="margin:0 !important; padding:8px 10px !important; font-size:0.85rem !important;">
                ${optionsHtml}
            </select>
        ` : `<input type="text" value="${item.producto}" onchange="actualizarProdEdicion(${idx}, this.value)" class="croiss-swal-input" style="margin:0 !important; padding:8px 10px !important; font-size:0.85rem !important;">`;

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

function recalcularTotalEdicion() {
    let total = 0;
    let cantNormales = 0;
    
    itemsEdicionTemp.forEach(item => {
        if(!item.producto.toLowerCase().includes('pop')) cantNormales += item.cantidad;
    });
    
    let precioBase = calcularPrecioBase(cantNormales);

    itemsEdicionTemp.forEach(item => {
        let esPop = item.producto.toLowerCase().includes('pop');
        let pUnit = 0;
        if(esPop) {
            let nombreLimpio = item.producto.replace(/\(salsas:.*?\)/gi, '').trim().toLowerCase();
            let pMatch = catalogoProductos.find(p => obtenerNombreDesdeObjeto(p).toLowerCase() === nombreLimpio);
            if(pMatch) {
                let rawP = obtenerPrecioDesdeObjeto(pMatch);
                pUnit = parseFloat(String(rawP).replace('$', '').replace(',', '.').trim()) || 0;
            }
        } else {
            pUnit = precioBase + obtenerExtraRelleno(item.producto);
        }
        total += (pUnit * item.cantidad);
    });

    const dtoSelect = document.getElementById('editDescuentoInput');
    const descuento = dtoSelect ? parseFloat(dtoSelect.value) : 0;
    const totalConDescuento = Math.max(0, Math.round(total * (1 - (descuento / 100))));

    const elTotal = document.getElementById('editMontoInput');
    if (elTotal) elTotal.value = totalConDescuento;
}

function actualizarCantEdicion(idx, val) {
    if(itemsEdicionTemp[idx]) itemsEdicionTemp[idx].cantidad = Math.max(1, parseInt(val) || 1);
    recalcularTotalEdicion();
}

function actualizarProdEdicion(idx, val) {
    if(itemsEdicionTemp[idx]) itemsEdicionTemp[idx].producto = val.trim();
    recalcularTotalEdicion();
}

function toggleJaleaEdicion(idx) {
    if(itemsEdicionTemp[idx]) {
        itemsEdicionTemp[idx].con_jalea = !itemsEdicionTemp[idx].con_jalea;
        refrescarDomEdicion();
    }
}

function eliminarItemEdicion(idx) {
    if(itemsEdicionTemp.length <= 1) {
        Swal.fire('Atención', 'El pedido debe conservar al menos un producto.', 'info');
        return;
    }
    itemsEdicionTemp.splice(idx, 1);
    refrescarDomEdicion();
    recalcularTotalEdicion();
}

function agregarItemEdicion() {
    let primerProducto = 'Croissant Clásico';
    if (Array.isArray(catalogoProductos) && catalogoProductos.length > 0) {
        let pValid = catalogoProductos.find(p => {
            let name = obtenerNombreDesdeObjeto(p);
            let nameLower = (name || '').toLowerCase();
            return name && !nameLower.includes('congelado') && !nameLower.includes('sobrevendido') && !nameLower.includes('masa');
        });
        if(pValid) primerProducto = obtenerNombreDesdeObjeto(pValid);
    }
    itemsEdicionTemp.push({ cantidad: 1, producto: primerProducto, con_jalea: false });
    refrescarDomEdicion();
    recalcularTotalEdicion();
}

function abrirEdicionPedido(numFila) {
    if (!numFila) return;
    let pEncontrado = null;
    let fechaActual = '';

    if (Array.isArray(agendaGlobalData)) {
        for (let dia of agendaGlobalData) {
            if (dia.pedidos) {
                let p = dia.pedidos.find(item => item.fila === numFila);
                if (p) { 
                    pEncontrado = p; 
                    fechaActual = dia.fecha;
                    break; 
                }
            }
        }
    }

    if (!pEncontrado) return;

    itemsEdicionTemp = parsearDescripcionAPedidos(pEncontrado.descripcion);
    if (itemsEdicionTemp.length === 0) {
        itemsEdicionTemp = [{ cantidad: 1, producto: 'Croissant Clásico', con_jalea: false }];
    }

    Swal.fire({
        title: `Editar Pedido de ${pEncontrado.cliente}`,
        html: `
            <div style="max-height:260px; overflow-y:auto; padding-right:4px;" id="contenedorItemsEdicion">
                ${generarHtmlListaEdicion()}
            </div>
            <button type="button" class="btn-jalea-chip active" style="margin-top:8px; width:100%; padding:8px;" onclick="agregarItemEdicion()">+ Agregar otro producto</button>
            
            <div style="margin-top:14px; text-align:left;">
                <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">FECHA DE ENTREGA</label>
                <input type="date" id="editFechaEntregaInput" value="${fechaActual}" class="croiss-swal-input" style="margin:0 0 10px 0 !important;">

                <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">NOTAS / COMENTARIOS DEL PEDIDO</label>
                <input type="text" id="editNotasInput" value="${pEncontrado.notas || ''}" placeholder="Ej: Separar salados, entregar con moño rojo..." class="croiss-swal-input" style="margin:0 !important;">
                
                <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px; margin-top:10px;">DESCUENTO (OPCIONAL)</label>
                <select id="editDescuentoInput" class="croiss-swal-input" style="margin:0 0 10px 0 !important;" onchange="recalcularTotalEdicion()">
                    <option value="0">0% (Sin descuento)</option>
                    <option value="10">10% OFF</option>
                    <option value="15">15% OFF</option>
                    <option value="20">20% OFF</option>
                    <option value="25">25% OFF</option>
                    <option value="50">50% OFF</option>
                    <option value="100">100% Gratis (Regalo)</option>
                </select>

                <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">MONTO TOTAL ($)</label>
                <input type="number" id="editMontoInput" value="${pEncontrado.monto || 0}" class="croiss-swal-input" style="margin:0 0 10px 0 !important;">
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'Guardar Cambios', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' },
        didOpen: () => {
            recalcularTotalEdicion();
        },
        preConfirm: () => {
            if (!itemsEdicionTemp || itemsEdicionTemp.length === 0) return false;
            let resumen = [];
            let totalCant = 0;
            for (let item of itemsEdicionTemp) {
                let prodNombre = (item.producto || '').trim();
                let cant = parseInt(item.cantidad) || 1;
                if (!prodNombre) return false;
                resumen.push(`${cant}x ${prodNombre}${item.con_jalea ? ' (Con Jalea)' : ''}`);
                totalCant += cant;
            }

            let campoNotas = document.getElementById('editNotasInput');
            let nuevasNotas = campoNotas ? campoNotas.value.trim() : '';

            let dtoSelect = document.getElementById('editDescuentoInput');
            let descSeleccionado = dtoSelect ? parseFloat(dtoSelect.value) : 0;
            if (descSeleccionado > 0 && !nuevasNotas.includes(`[Dto ${descSeleccionado}%]`)) {
                nuevasNotas = `[Dto ${descSeleccionado}%] ${nuevasNotas}`.trim();
            }

            let campoFecha = document.getElementById('editFechaEntregaInput');
            let nuevaFecha = campoFecha ? campoFecha.value.trim() : '';

            let campoMonto = document.getElementById('editMontoInput');
            let nuevoMonto = campoMonto ? parseFloat(campoMonto.value) : pEncontrado.monto;

            return { 
                fila: numFila, 
                producto: resumen.join(', '), 
                cantidad: totalCant,
                notas: nuevasNotas,
                fecha_entrega: nuevaFecha,
                monto_total: nuevoMonto
            };
        }
    }).then(async (result) => {
        if (result.isConfirmed && result.value) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/editar_pedido', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(result.value)
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if(data.status === 'exito') {
                    mostrarCroissExito('Pedido Actualizado', 'Se guardaron los cambios.');
                    cargarTodaLaSeccionAgenda(false);
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch(e) { Swal.fire('Error', 'No se pudo conectar con el servidor.', 'error'); }
        }
    });
}

function generarPDFDia(fecha) {
    const diaData = agendaGlobalData.find(d => d.fecha === fecha);
    if(!diaData || !diaData.pedidos || diaData.pedidos.length === 0) {
        Swal.fire('Atención', 'No hay pedidos registrados para este día.', 'warning');
        return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
        Swal.fire('Error', 'Las librerías PDF no están cargadas.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    const limpiarEmojis = (texto) => {
        if (!texto) return '';
        return texto.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(200, 109, 40);
    doc.text("CROISS - Hoja de Producción y Armado", 14, 20);
    
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(45, 30, 24);
    doc.text(`Fecha: ${limpiarEmojis(diaData.nombre_dia)} (${fecha}) | Total Croissants: ${diaData.total_croissants} un.`, 14, 28);
    
    let bodyPedidos = [];
    diaData.pedidos.forEach(p => {
        let contactoStr = limpiarEmojis(p.cliente || 'Cliente');
        if(p.telefono) contactoStr += `\nTel: ${limpiarEmojis(p.telefono)}`;
        if(p.direccion) contactoStr += `\nDir: ${limpiarEmojis(p.direccion)}`;

        let detalleStr = limpiarEmojis(p.descripcion || '-');
        if(p.notas) detalleStr += `\nNOTA: ${limpiarEmojis(p.notas)}`;

        bodyPedidos.push([contactoStr, detalleStr, (p.cantidad || 0) + ' un.']);
    });
    
    doc.autoTable({
        startY: 34, head: [['Cliente / Datos de Entrega', 'Detalle del Pedido', 'Cantidad']],
        body: bodyPedidos, theme: 'grid', styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [45, 30, 24], fontStyle: 'bold' }
    });
    
    let resumenCantidades = {};
    diaData.pedidos.forEach(p => {
        if (p.descripcion) {
            p.descripcion.split(',').forEach(item => {
                let itemLimpio = item.trim();
                if (!itemLimpio) return;
                let match = itemLimpio.match(/^(\d+)x\s+(.+)/);
                if(match) {
                    resumenCantidades[match[2].trim()] = (resumenCantidades[match[2].trim()] || 0) + parseInt(match[1]);
                } else {
                    resumenCantidades[itemLimpio] = (resumenCantidades[itemLimpio] || 0) + 1;
                }
            });
        }
    });
    
    let bodyResumen = Object.keys(resumenCantidades).map(sabor => [limpiarEmojis(sabor), resumenCantidades[sabor] + ' un.']);
    
    doc.autoTable({
        startY: doc.lastAutoTable.finalY + 12, head: [['Resumen Total de Sabores (A Hornear)', 'Total Unidades']],
        body: bodyResumen, theme: 'grid', styles: { fontSize: 10, fontStyle: 'bold', cellPadding: 3 },
        headStyles: { fillColor: [200, 109, 40], fontStyle: 'bold' }
    });
    
    doc.save(`Agenda_CROISS_${fecha}.pdf`);
}

// ==========================================
// CUENTAS Y ESTADOS DE ENTREGA
// ==========================================
async function cargarCuentas(conLoader = true) {
    const contPago = document.getElementById('listaPendientesPago');
    const contEntrega = document.getElementById('listaPendientesEntrega');
    const bannerTotal = document.getElementById('cMontoPendienteTotal');

    const tInicio = Date.now();
    if (conLoader) mostrarCroissLoader();

    try {
        const res = await fetch('/api/cuentas');
        const data = await res.json();
        if (conLoader) await esperarAnimacionMinima(tInicio, 1800);

        if (data.status === 'exito') {
            if(bannerTotal) bannerTotal.innerText = `$${data.total_por_cobrar}`;

            const btnCuentas = document.getElementById('segBtnCuentas');
            if (btnCuentas) {
                const cantPendientes = data.pendientes_pago.length;
                if (cantPendientes > 0) {
                    btnCuentas.innerHTML = `Deudores <span style="background:#dc2626; color:white; border-radius:10px; padding:2px 6px; font-size:0.65rem; margin-left:4px; vertical-align:middle;">${cantPendientes}</span>`;
                } else {
                    btnCuentas.innerHTML = `Deudores`;
                }
            }

            if(contPago) {
                contPago.innerHTML = '';
                if (data.pendientes_pago.length === 0) {
                    contPago.innerHTML = '<p style="font-size:0.85rem; color:#16a34a; font-weight:600;">Excelente! Nadie te debe dinero.</p>';
                } else {
                    data.pendientes_pago.forEach(p => {
                        const clienteClean = p.cliente.replace(/'/g, "\\'");
                        
                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 12px;';
                        div.innerHTML = `
                            <div style="flex: 1; min-width: 0;">
                                <strong style="color: var(--text-main); font-size: 0.95rem;">${p.cliente}</strong> <small style="color:#64748b;">(${p.fecha_entrega})</small><br>
                                <span style="font-size:0.82rem; color:#475569; margin-top:2px; display:inline-block;">${p.producto} (${p.cantidad} un.)</span><br>
                                <span style="font-size:0.9rem; font-weight:800; color:#dc2626; margin-top:2px; display:inline-block;">Monto: $${p.monto}</span>
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; min-width: 190px; flex-shrink: 0;">
                                <button type="button" class="btn-pagar-ahora" style="margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; box-shadow:none; background:#16A34A;" onclick="marcarComoPagado(${p.fila}, '${clienteClean}')">💸 Pagado</button>
                                <button type="button" class="btn-jalea-chip" style="margin:0; padding:6px 4px; font-size:0.75rem; background:#009EE3; color:#FFFFFF; border-color:#009EE3; border-radius:10px; width:100%; box-sizing:border-box; font-weight:bold; display:flex; align-items:center; justify-content:center;" onclick="enviarLinkPagoWhatsApp(${p.fila}, '${p.telefono || ''}')">📲 Link MP</button>
                                <button type="button" class="btn-jalea-chip" style="margin:0; padding:6px 4px; font-size:0.75rem; background:#FEF3C7; color:#B45309; border-color:#FDE68A; border-radius:10px; width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center;" onclick="enviarRecordatorioPago(${p.fila}, '${clienteClean}')">📩 Mail</button>
                                <button type="button" class="btn-remove" style="margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center;" onclick="eliminarPedido(${p.fila}, '${clienteClean}')">Cancelar</button>
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
                        const clienteClean = e.cliente.replace(/'/g, "\\'");

                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.style.alignItems = 'flex-start'; 
                        
                        const avisoEnCamino = (e.entrega && e.entrega.toLowerCase() === 'en camino') 
                            ? `<div style="color:#2563EB; font-weight:800; font-size:0.75rem; margin-top:6px;">🛵 ¡El pedido ya salió!</div>` : '';

                        let bloqueNota = '';
                        if (e.notas) {
                            let notaLimpia = e.notas.replace(/\[WEB\]/gi, '').replace(/\[Dto.*?\]/gi, '').trim();
                            if (notaLimpia.length > 25) {
                                bloqueNota = `
                                    <div style="margin-top:6px; font-size:0.75rem; color:#B45309; font-weight:800; background:#FEF3C7; border:1px solid #FDE68A; padding:6px 10px; border-radius:10px; display:inline-block;">
                                        ⚠️ Tiene nota (Leer en Agenda)
                                    </div>
                                `;
                            } else {
                                bloqueNota = `
                                    <div style="margin-top:6px; font-size:0.75rem; color:var(--accent); font-weight:800; background:#FAF0EB; border:1px solid #F7DFC8; padding:6px 10px; border-radius:10px; display:inline-block;">
                                        📝 Nota: ${e.notas}
                                    </div>
                                `;
                            }
                        }

                        const esGratis = e.monto <= 0;
                        const botonCobroOPago = (esPagado || esGratis)
                            ? `<div class="agenda-badge badge-ok" style="display:flex; align-items:center; justify-content:center; margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; text-align:center; height:100%; box-sizing:border-box;">${esGratis ? 'Cortesía $0' : 'Pagado'}</div>`
                            : `<button type="button" class="btn-pagar-ahora" style="margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; height:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; box-shadow:none; background:#16A34A;" onclick="marcarComoPagado(${e.fila}, '${clienteClean}')">💸 Pago</button>`;

                        div.innerHTML = `
                            <div style="flex: 1; padding-right: 12px;">
                                <strong style="color: var(--text-main); font-size: 0.95rem;">${e.fecha_entrega}</strong><br>
                                <strong style="color: var(--text-main); font-size: 0.9rem;">${e.cliente}</strong><br>
                                <span style="font-size:0.82rem; color:#475569; margin-top:2px; display:inline-block;">${e.producto} (${e.cantidad} un.)</span><br>
                                ${e.direccion ? `<span style="font-size:0.8rem; color:var(--text-muted); display:inline-block; margin-top:2px;">📍 ${e.direccion}</span>` : ''}
                                <br>${bloqueNota}
                                ${avisoEnCamino}
                            </div>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; min-width: 175px; flex-shrink: 0;">
                                ${botonCobroOPago}
                                <button type="button" class="btn-remove" style="margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; box-sizing:border-box;" onclick="eliminarPedido(${e.fila}, '${clienteClean}')">Eliminar</button>
                                
                                <button type="button" class="btn-jalea-chip" style="margin:0; padding:6px 4px; font-size:0.75rem; background:#DBEAFE; color:#1D4ED8; border-color:#BFDBFE; border-radius:10px; width:100%; box-sizing:border-box;" onclick="marcarEnCamino(${e.fila}, '${clienteClean}')">🛵 Camino</button>
                                <button type="button" class="btn-jalea-chip active" style="margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; box-sizing:border-box;" onclick="notificarEntrega(${e.fila}, '${clienteClean}')">✔️ Entregado</button>
                            </div>
                        `;
                        contEntrega.appendChild(div);
                    });
                }
            }
        }
    } catch (err) {
        console.error("Error al cargar entregas:", err);
    } finally {
        if (conLoader) cerrarCroissLoaderSeguro();
    }
}

async function marcarComoPagado(numFila, nombreCliente) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">Confirmar cobro?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se marcará la orden de <strong style="color:var(--text-main);">${nombreCliente}</strong> como PAGADA.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, cobrado', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/cambiar_estado_pago', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila, estado: 'Pagado' })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cobro Registrado!', `El pedido de ${nombreCliente} ya figura al día.`);
                    cargarTodaLaSeccionAgenda(false);
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        }
    });
}

async function notificarEntrega(numFila, nombreCliente) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">Confirmar entrega?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se enviará el mail de agradecimiento a <strong style="color:var(--text-main);">${nombreCliente}</strong>.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, entregar y notificar', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/marcar_entregado', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Pedido Entregado!', `Notificación enviada a ${nombreCliente}.`);
                    cargarTodaLaSeccionAgenda(false);
                    if (typeof cargarClientes === 'function') cargarClientes();
                } else { Swal.fire('Atención', data.mensaje, 'warning'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        }
    });
}

async function marcarEnCamino(numFila, clienteNombre) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">¿Marcar pedido en camino?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Se le enviará un correo automático a <strong style="color:var(--text-main);">${clienteNombre}</strong> para avisarle que su orden ya salió hacia su dirección.</p>`,
        showCancelButton: true, confirmButtonText: '🛵 Sí, en camino', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/marcar_en_camino', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('¡Pedido en camino!', `Aviso enviado por e-mail a ${clienteNombre}.`);
                    cargarTodaLaSeccionAgenda(false);
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        }
    });
}

async function eliminarPedido(numFila, clienteNombre) {
    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.2rem;">¿Qué deseas hacer con esta orden?</strong>`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted); font-weight:600; margin-top:4px; line-height:1.4;">Pedido de <strong style="color:var(--text-main);">${clienteNombre}</strong>.</p>`,
        showCancelButton: true, showDenyButton: true,
        confirmButtonText: '📧 Cancelar y Avisar por Mail',
        denyButtonText: '🗑️ Solo Borrar (Error de Carga)',
        cancelButtonText: 'Volver', buttonsStyling: false,
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-btn-danger', denyButton: 'croiss-swal-cancel', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        let enviarMail = false;
        if (result.isConfirmed) enviarMail = true;
        else if (result.isDenied) enviarMail = false;
        else return;

        const tInicio = Date.now();
        mostrarCroissLoader();

        try {
            const res = await fetch('/api/eliminar_venta', {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ fila: numFila, notificar: enviarMail })
            });
            const data = await res.json();
            await esperarAnimacionMinima(tInicio, 1800);

            if (data.status === 'exito') {
                mostrarCroissExito(
                    enviarMail ? 'Pedido Cancelado' : 'Orden Eliminada',
                    enviarMail ? `Se envió el correo de notificación a ${clienteNombre}.` : 'Se removió la orden y devolvió el stock sin enviar mail.'
                );
                cargarTodaLaSeccionAgenda(false);
                if (typeof cargarClientes === 'function') cargarClientes();
            } else { Swal.fire('Error', data.mensaje, 'error'); }
        } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
    });
}

// ==========================================
// CONTROL DE STOCK E INSUMOS
// ==========================================
function cambiarSegmentoStock(segmento) {
    const btnCong = document.getElementById('segBtnStockCongelados');
    const btnMat = document.getElementById('segBtnStockMateriaPrima');
    const btnEmp = document.getElementById('segBtnStockEmpaque');
    if (btnCong) btnCong.classList.toggle('active', segmento === 'congelados');
    if (btnMat) btnMat.classList.toggle('active', segmento === 'materiaprima');
    if (btnEmp) btnEmp.classList.toggle('active', segmento === 'empaque');

    const subCong = document.getElementById('subSecStockCongelados');
    const subMat = document.getElementById('subSecStockMateriaPrima');
    const subEmp = document.getElementById('subSecStockEmpaque');
    if (subCong) subCong.classList.toggle('active', segmento === 'congelados');
    if (subMat) subMat.classList.toggle('active', segmento === 'materiaprima');
    if (subEmp) subEmp.classList.toggle('active', segmento === 'empaque');
}

async function cargarStockCongelados() {
    try {
        if (typeof cargarStockPop === 'function') cargarStockPop();
        const resCong = await fetch('/api/stock/congelados');
        const dataCong = await resCong.json();
        if (dataCong.status === 'exito') {
            actualizarUIStockCongelados(dataCong);
        }
        await cargarStock(true);
    } catch (err) {
        console.error("Error al cargar congelados:", err);
    }
}


function abrirModalEditarInsumo(nombreInsumo, stockActual, unidadActual, vencActual) {
    Swal.fire({
        title: `Editar ${nombreInsumo}`,
        html: `
            <div style="text-align: left; margin-top: 10px; font-size:0.85rem;">
                <label style="font-weight:700; display:block; margin-bottom:4px;">Stock Actual Exacto:</label>
                <input type="number" id="editInsumoStock" class="swal2-input" value="${stockActual}" step="0.1" style="margin:0 0 10px 0; width:100%;">
                <div style="display:flex; gap:10px; margin-bottom:10px;">
                    <div style="flex:1;">
                        <label style="font-weight:700; display:block; margin-bottom:4px;">Unidad:</label>
                        <select id="editInsumoUnidad" class="swal2-input" style="margin:0; width:100%;">
                            <option value="un" ${unidadActual === 'un' ? 'selected' : ''}>un (Unidades)</option>
                            <option value="kg" ${unidadActual === 'kg' ? 'selected' : ''}>kg (Kilos)</option>
                            <option value="gr" ${unidadActual === 'gr' ? 'selected' : ''}>gr (Gramos)</option>
                            <option value="ml" ${unidadActual === 'ml' ? 'selected' : ''}>ml (Mililitros)</option>
                        </select>
                    </div>
                </div>
                <label style="font-weight:700; display:block; margin-bottom:4px;">Vencimiento:</label>
                <input type="date" id="editInsumoVenc" class="swal2-input" value="${vencActual !== 'Sin fecha' ? vencActual : ''}" style="margin:0; width:100%;">
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'Guardar Cambios', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' },
        preConfirm: () => {
            const st = parseFloat(document.getElementById('editInsumoStock').value);
            if (isNaN(st) || st < 0) { Swal.showValidationMessage('Ingresa un stock válido.'); return false; }
            return { insumo: nombreInsumo, stock: st, unidad: document.getElementById('editInsumoUnidad').value, vencimiento: document.getElementById('editInsumoVenc').value };
        }
    }).then(async (res) => {
        if (res.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const r = await fetch('/api/stock/editar_insumo', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(res.value) });
                const data = await r.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Insumo Actualizado', data.mensaje);
                    cargarInsumosYGastos();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo guardar la modificación', 'error'); }
        }
    });
}

function eliminarInsumoDirecto(nombreInsumo) {
    Swal.fire({
        title: `¿Eliminar ${nombreInsumo}?`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted);">Se eliminará este insumo de la lista de stock permanente.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-btn-danger', cancelButton: 'croiss-swal-cancel' }
    }).then(async (res) => {
        if (res.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const r = await fetch('/api/stock/eliminar_insumo', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ insumo: nombreInsumo }) });
                const data = await r.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Insumo Eliminado', `${nombreInsumo} fue removido.`);
                    cargarInsumosYGastos();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo eliminar el insumo', 'error'); }
        }
    });
}

function abrirModalSumarStock(tipoCategoria) {
    const esEmpaque = tipoCategoria === 'Empaque';
    const opcionesEmpaque = `<option value="Caja X6">Caja X6 (6 croiss)</option><option value="Caja X3">Caja X3 (3 croiss)</option><option value="Caja X1">Caja X1 (1 croiss)</option><option value="Papel Manteca">Papel Manteca</option><option value="Rollo Film">Rollo Film</option><option value="Bolsas">Bolsas</option>`;
    const opcionesMateriaPrima = `<option value="Harina 000">Harina 000</option><option value="Manteca">Manteca</option><option value="Dulce de Leche">Dulce de Leche</option><option value="Jamón">Jamón</option><option value="Queso">Queso</option><option value="Azúcar">Azúcar</option><option value="Huevos">Huevos</option><option value="Levadura">Levadura</option><option value="Leche">Leche</option><option value="Esencia de Vainilla">Esencia de Vainilla</option><option value="Sal">Sal</option>`;

    Swal.fire({
        title: `<strong style="color:var(--text-main); font-size:1.1rem;">Cargar Stock (${esEmpaque ? 'Empaque' : 'Materia Prima'})</strong>`,
        html: `
            <div style="text-align:left; font-size:0.85rem; color:#334155;">
                <label style="font-weight:700; display:block; margin-bottom:4px;">Seleccionar o Escribir Insumo:</label>
                <select id="swalInsumoSelect" class="swal2-input" style="margin:0 0 10px 0; width:100%; font-size:0.88rem;" onchange="if(this.value==='OTRO'){document.getElementById('swalInsumoOtro').style.display='block';}else{document.getElementById('swalInsumoOtro').style.display='none';}">
                    ${esEmpaque ? opcionesEmpaque : opcionesMateriaPrima}
                    <option value="OTRO">+ Otro Insumo (Escribir personalizado)</option>
                </select>
                <input type="text" id="swalInsumoOtro" class="swal2-input" placeholder="Nombre del nuevo insumo..." style="display:none; margin:0 0 10px 0; width:100%; font-size:0.88rem;">
                <div style="display:flex; gap:10px;">
                    <div style="flex:1;"><label style="font-weight:700; display:block; margin-bottom:4px;">Cantidad a Sumar:</label><input type="number" id="swalCantidad" class="swal2-input" placeholder="Ej: 50" step="0.1" value="1" style="margin:0; width:100%; font-size:0.88rem;"></div>
                    <div style="flex:1;"><label style="font-weight:700; display:block; margin-bottom:4px;">Unidad:</label><select id="swalUnidad" class="swal2-input" style="margin:0; width:100%; font-size:0.88rem;"><option value="${esEmpaque ? 'un' : 'kg'}">${esEmpaque ? 'un (Unidades)' : 'kg (Kilos)'}</option><option value="gr">gr (Gramos)</option><option value="ml">ml (Mililitros)</option><option value="un">un (Unidades)</option></select></div>
                </div>
                <label style="font-weight:700; display:block; margin:10px 0 4px 0;">Vencimiento (Opcional):</label>
                <input type="date" id="swalVencimiento" class="swal2-input" style="margin:0; width:100%; font-size:0.88rem;">
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'Sumar al Stock', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' },
        preConfirm: () => {
            const selVal = document.getElementById('swalInsumoSelect').value;
            const elOtro = document.getElementById('swalInsumoOtro');
            const otroVal = elOtro ? elOtro.value.trim() : '';
            const nomFinal = selVal === 'OTRO' ? otroVal : selVal;
            const cantVal = parseFloat(document.getElementById('swalCantidad').value);

            if (!nomFinal) { Swal.showValidationMessage('Debes ingresar el nombre del insumo'); return false; }
            if (isNaN(cantVal) || cantVal <= 0) { Swal.showValidationMessage('Ingresa una cantidad mayor a 0'); return false; }

            return { insumo: nomFinal, cantidad: cantVal, unidad: document.getElementById('swalUnidad').value, vencimiento: document.getElementById('swalVencimiento').value };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/stock/sumar_insumo', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(result.value) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Stock Actualizado', data.mensaje);
                    cargarInsumosYGastos();
                } else { Swal.fire('Atención', data.mensaje, 'warning'); }
            } catch (err) { Swal.fire('Error', 'No se pudo guardar el stock', 'error'); }
            finally {
                cerrarCroissLoaderSeguro();
            }
        }
    });
}

function abrirModalSumarCongelados() {
    Swal.fire({
        title: 'Agregar Masas Listas',
        customClass: { popup: 'croiss-swal-popup', title: 'croiss-swal-title', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' },
        buttonsStyling: false,
        html: `<div style="text-align: left; margin-top: 14px;"><label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Cantidad de masas preparadas (1 masa = 10 croiss)</label><input type="number" id="inputSumarMasas" class="croiss-swal-input" value="1" min="1" placeholder="Ej: 2"></div>`,
        showCancelButton: true, confirmButtonText: '+ Sumar Masas', cancelButtonText: 'Cancelar', focusConfirm: false,
        preConfirm: () => {
            const cant = document.getElementById('inputSumarMasas').value;
            if (!cant || parseInt(cant) <= 0) { Swal.showValidationMessage('Ingresá una cantidad de masas válida.'); return false; }
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
                    body: JSON.stringify({ masas: result.value }) 
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                cerrarCroissLoaderSeguro();

                if (data.status === 'exito') {
                    actualizarUIStockCongelados(data);
                    mostrarCroissExito('Masas Agregadas!', `Se sumaron +${result.value} masa(s) (+${result.value * 10} croissants habilitados).`);
                } else { 
                    Swal.fire('Error', data.mensaje || 'No se pudo sumar la masa', 'error'); 
                }
            } catch (err) { 
                cerrarCroissLoaderSeguro();
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); 
            }
        }
    });
}
// ==========================================
// CLIENTES Y DIRECTORIO CRM
// ==========================================

function guardarPlantillaPromo() {
    const txt = document.getElementById('txtPlantillaPromo').value;
    localStorage.setItem('croiss_promo_msg', txt);
    Swal.fire({
        title: 'Guardado', text: 'Plantilla de WhatsApp actualizada.', icon: 'success', timer: 1500, showConfirmButton: false
    });
}

function cambiarSegmentoCliente(segmento) {
    document.querySelectorAll('#sec-clientes .seg-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('#sec-clientes .sub-seccion').forEach(s => s.classList.remove('active'));

    const btnLis = document.getElementById('segBtnLista');
    const btnPro = document.getElementById('segBtnPromo');
    const btnMen = document.getElementById('segBtnMensajes');

    const subLis = document.getElementById('subSecLista');
    const subPro = document.getElementById('subSecPromo');
    const subMen = document.getElementById('subSecMensajes');

    if (segmento === 'lista') {
        if (btnLis) btnLis.classList.add('active');
        if (subLis) subLis.classList.add('active');
        datosClientesGlobal.subOrigen = 'lista';
    } else if (segmento === 'promo') {
        if (btnPro) btnPro.classList.add('active');
        if (subPro) subPro.classList.add('active');
        datosClientesGlobal.subOrigen = 'promo';
    } else {
        if (btnMen) btnMen.classList.add('active');
        if (subMen) subMen.classList.add('active');
        datosClientesGlobal.subOrigen = 'mensajes';
        const txtArea = document.getElementById('txtPlantillaPromo');
        if (txtArea) txtArea.value = localStorage.getItem('croiss_promo_msg') || '¡Hola {nombre}! Te escribimos de Croiss para regalarte este cupón...';
    }
}

function renderizarListaDirectorio(lista) {
    const contDirectorio = document.getElementById('listaClientesDirectorio');
    const labelCant = document.getElementById('cantClientesLabel');
    
    if (labelCant) labelCant.innerText = `Directorio General (${lista ? lista.length : 0} clientes)`;
    if (!contDirectorio) return;

    // Inyectar dinámicamente el selector de orden sin romper tu HTML original
    if (!document.getElementById('selectOrdenCliente')) {
        const elBuscador = document.getElementById('inputBuscarCliente');
        if (elBuscador && elBuscador.parentNode) {
            const selectDiv = document.createElement('div');
            selectDiv.style.marginTop = '8px';
            selectDiv.style.marginBottom = '12px';
            selectDiv.innerHTML = `
                <select id="selectOrdenCliente" onchange="filtrarDirectorioClientes()" class="croiss-swal-input" style="padding: 6px; font-size: 0.8rem; margin: 0; width: 100%; border-radius: 8px;">
                    <option value="nombre_asc">Ordenar por: Nombre (A-Z)</option>
                    <option value="recientes">Ordenar por: Compra más reciente (Hoy)</option>
                    <option value="antiguos">Ordenar por: Compra más antigua (Para promos)</option>
                    <option value="riesgo">Ordenar por: ⚠️ En Riesgo primero</option>
                </select>
            `;
            elBuscador.parentNode.insertBefore(selectDiv, elBuscador.nextSibling);
        }
    }

    contDirectorio.innerHTML = '';
    if (!lista || lista.length === 0) {
        contDirectorio.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:20px 0;">No se encontraron clientes.</p>';
        return;
    }

    lista.forEach(c => {
        const div = document.createElement('div');
        div.className = 'ios-cliente-row compact';
        div.style.cursor = 'pointer';
        div.onclick = (e) => { e.preventDefault(); verDetalleCliente(c); };

        const idTag = c.id_cliente ? `<small style="color:var(--accent); font-weight:700; margin-right:6px;">[${c.id_cliente}]</small>` : '';

        let txtUltimaCompra = 'Sin compras';
        if (c.dias_sin_comprar !== undefined && c.dias_sin_comprar !== 999) {
            if (c.dias_sin_comprar === 0) txtUltimaCompra = 'Compró Hoy';
            else if (c.dias_sin_comprar < 0) txtUltimaCompra = 'Pedido Futuro';
            else txtUltimaCompra = `Hace ${c.dias_sin_comprar} día(s)`;
        }

        // Nuevo tag visual para clientes en riesgo
        const catBadge = c.categoria === '⚠️ En Riesgo' ? `<span style="background:#FEF2F2; color:#DC2626; padding:2px 6px; border-radius:6px; font-size:0.65rem; font-weight:800; margin-left:6px; vertical-align:middle;">⚠️ En Riesgo</span>` : '';

        div.innerHTML = `
            <div>
                <strong>${idTag}${c.nombre || 'Sin nombre'}</strong>${catBadge}<br>
                <small style="color:var(--text-muted);">${c.total_pedidos || 0} ped. - ${c.total_croissants || 0} cl. | ${c.total_pops || 0} pop</small><br>
                <small style="color:#C86D28; font-weight:700;">Última vez: ${txtUltimaCompra}</small>
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
    if (elNom) {
        const catBadge = clienteObj.categoria ? `<span style="font-size:0.75rem; background:#FAF0EB; color:var(--accent); border:1px solid #F7DFC8; padding:3px 10px; border-radius:12px; font-weight:800; margin-left:8px; vertical-align:middle;">${clienteObj.categoria}</span>` : '';
        elNom.innerHTML = `${clienteObj.nombre || 'Cliente'}${catBadge}`;
    }

    const elStats = document.getElementById('detClienteStats');
    if (elStats) {
        let txtUltimaCompra = 'Sin datos';
        
        if (clienteObj.dias_sin_comprar !== undefined && clienteObj.dias_sin_comprar !== 999) {
            if (clienteObj.dias_sin_comprar < 0) {
                txtUltimaCompra = 'Pedido Agendado';
            } else if (clienteObj.dias_sin_comprar === 0) {
                txtUltimaCompra = 'Hoy';
            } else {
                txtUltimaCompra = `Hace ${clienteObj.dias_sin_comprar} día${clienteObj.dias_sin_comprar > 1 ? 's' : ''}`;
            }
        }

        elStats.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0; text-align: left;">
                <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
                    <small style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; display: block;">🥐 Sabor Favorito</small>
                    <strong style="color: var(--text-main); font-size: 0.88rem;">${clienteObj.sabor_favorito || 'Variado'}</strong>
                </div>
                <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
                    <small style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; display: block;">💵 Ticket Promedio</small>
                    <strong style="color: #16A34A; font-size: 0.88rem;">$${clienteObj.ticket_promedio || 0} / pedido</strong>
                </div>
                <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
                    <small style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; display: block;">📊 Cantidades</small>
                    <strong style="color: var(--accent); font-size: 0.88rem;">${clienteObj.total_croissants || 0} cl. | ${clienteObj.total_pops || 0} pop</strong>
                </div>
                <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
                    <small style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; display: block;">🗓️ Última Compra</small>
                    <strong style="color: var(--text-main); font-size: 0.88rem;">${txtUltimaCompra}</strong>
                </div>
            </div>
        `;
    }

    const contContacto = document.getElementById('detClienteContacto');
    if (contContacto) {
        let datosStr = [];
        if (clienteObj.telefono) datosStr.push(`Tel: ${clienteObj.telefono}`);
        if (clienteObj.email) datosStr.push(`Email: ${clienteObj.email}`);
        
        let dirTexto = clienteObj.direccion ? `<br><span style="color:var(--text-main); font-weight:600;">Dir: ${clienteObj.direccion}</span>` : '';
        let mapsBtn = clienteObj.direccion ? ` <button type="button" class="btn-jalea-chip" style="margin-left:6px; font-size:0.7rem; padding: 2px 8px;" onclick="abrirGoogleMaps('${encodeURIComponent(clienteObj.direccion)}')">Abrir Maps</button>` : '';

        let telLimpio = (clienteObj.telefono || '').replace(/\D/g, ''); 
        if (telLimpio.startsWith('0')) telLimpio = telLimpio.substring(1); 
        if (telLimpio && !telLimpio.startsWith('598')) telLimpio = '598' + telLimpio; 

        let btnWhatsApp = '';
        if (telLimpio) {
            let primerNombre = (clienteObj.nombre || '').trim().split(' ')[0];
            let msgPlantilla = localStorage.getItem('croiss_promo_msg') || '¡Hola {nombre}! Te escribimos de CROISS 🥐 ¿Cómo estás?';
            
            let msgText = encodeURIComponent(msgPlantilla.replace(/\{nombre\}/gi, primerNombre));
            
            btnWhatsApp = `<a href="https://wa.me/${telLimpio}?text=${msgText}" target="_blank" class="btn-jalea-chip" style="background:#25D366; color:white; border:none; padding:6px 12px; font-size:0.78rem; text-decoration:none; font-weight:700; margin-right:6px; display:inline-block;">💬 Abrir WhatsApp</a>`;
        }

        const btnEditar = `<button type="button" class="btn-jalea-chip active" style="font-size:0.78rem; padding:6px 12px;" onclick="abrirModalEditarCliente()">✏️ Editar Datos</button>`;
        
        contContacto.innerHTML = `
            <div>${datosStr.join(' | ') || 'Sin datos de contacto'}${dirTexto}${mapsBtn}</div>
            <div style="margin-top:10px; display:flex; gap:6px;">${btnWhatsApp}${btnEditar}</div>
        `;
    }

    const contHist = document.getElementById('detClienteHistorial');
    if (contHist) {
        contHist.innerHTML = '';
        const historial = Array.isArray(clienteObj.historial) ? clienteObj.historial : [];
        if (historial.length === 0) {
            contHist.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">Sin pedidos en el historial.</p>';
            return;
        }

        historial.forEach(h => {
            const estPago = h.estado_pago || h.estado || 'Pendiente';
            const estEntrega = String(h.estado_entrega || h.entrega || '').trim().toLowerCase();
            const colorPago = estPago.toLowerCase() === 'pagado' ? '#16a34a' : '#dc2626';

            let estEntregaBadge = estEntrega.includes('entregad') ? '<span style="background:#dcfce7; color:#15803d; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">🚚 Entregado</span>' : '<span style="background:#fef3c7; color:#b45309; padding:2px 8px; border-radius:10px; font-size:0.72rem; font-weight:700;">⏳ Por Entregar</span>';
            const nombreEscapado = (clienteObj.nombre || '').replace(/'/g, "\\'");

            const div = document.createElement('div');
            div.className = 'historial-compra-card';
            div.innerHTML = `
                <div>
                    <strong>Fecha: ${h.fecha || 'Sin fecha'}</strong> <small style="color:${colorPago}; font-weight:700;">[${estPago}]</small> ${estEntregaBadge}<br>
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

function filtrarDirectorioClientes() {
    const elBusqueda = document.getElementById('inputBuscarCliente');
    const elOrden = document.getElementById('selectOrdenCliente'); 
    
    let textoBuscado = elBusqueda ? elBusqueda.value.toLowerCase().trim() : '';
    let criterioOrden = elOrden ? elOrden.value : 'nombre_asc';
    
    let listaFiltrada = datosClientesGlobal.todos.filter(c => c.nombre && c.nombre.toLowerCase().includes(textoBuscado));
    
    // Nueva lógica de ordenamiento
    listaFiltrada.sort((a, b) => {
        if (criterioOrden === 'nombre_asc') {
            return (a.nombre || '').localeCompare(b.nombre || '');
        } else if (criterioOrden === 'recientes') {
            let diasA = (a.dias_sin_comprar !== undefined && a.dias_sin_comprar !== 999) ? a.dias_sin_comprar : 9999;
            let diasB = (b.dias_sin_comprar !== undefined && b.dias_sin_comprar !== 999) ? b.dias_sin_comprar : 9999;
            return diasA - diasB;
        } else if (criterioOrden === 'antiguos') {
            let diasA = (a.dias_sin_comprar !== undefined && a.dias_sin_comprar !== 999) ? a.dias_sin_comprar : -1;
            let diasB = (b.dias_sin_comprar !== undefined && b.dias_sin_comprar !== 999) ? b.dias_sin_comprar : -1;
            return diasB - diasA; // Invertido para los más viejos primero
        } else if (criterioOrden === 'riesgo') {
            let catA = (a.categoria === '⚠️ En Riesgo') ? 0 : 1;
            let catB = (b.categoria === '⚠️ En Riesgo') ? 0 : 1;
            if (catA !== catB) return catA - catB;
            return (a.nombre || '').localeCompare(b.nombre || '');
        }
        return 0;
    });

    renderizarListaDirectorio(listaFiltrada);
}

function toggleModoPrivacidad() {
    const estaPrivado = document.body.classList.toggle('modo-privado');
    const txtBtn = document.getElementById('txtModoPrivado');
    if (txtBtn) txtBtn.innerText = estaPrivado ? "Mostrar Cifras" : "Ocultar para Historia";
}

async function cargarClientes() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const elMes = document.getElementById('cMesFilter');
        const mesVal = elMes ? elMes.value : hoy.substring(0, 7);

        const res = await fetch(`/api/clientes?mes=${mesVal}`);
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);

        if (data.status === 'exito') {
            datosClientesGlobal.todos = data.clientes_todos || [];
            datosClientesGlobal.ranking = data.ranking_mes || [];

            renderizarListaDirectorio(datosClientesGlobal.todos);

            const bannerNombre = document.getElementById('topNombre');
            const bannerDetalle = document.getElementById('topDetalle');

            if (data.top_cliente_mes) {
                if (bannerNombre) bannerNombre.innerText = formatNombrePrivado(data.top_cliente_mes.nombre);
                
                let textoBanner = '';
                if(data.top_cliente_mes.total_croissants > 0) textoBanner += `${data.top_cliente_mes.total_croissants} Clásicos`;
                if(data.top_cliente_mes.total_pops > 0) textoBanner += (textoBanner ? ' y ' : '') + `${data.top_cliente_mes.total_pops} Pops`;

                if (bannerDetalle) bannerDetalle.innerHTML = `Lidera el mes con <span class="cifra-sensible" style="font-weight:800;">${textoBanner}</span> comprados`;
            } else {
                if (bannerNombre) bannerNombre.innerText = 'Sin Compradores';
                if (bannerDetalle) bannerDetalle.innerText = 'Aún no se registraron ventas en este mes.';
            }

            renderizarRankingMes(data.ranking_mes);
        }
    } catch (err) {
        console.error("Error al cargar clientes:", err);
    } finally {
        cerrarCroissLoaderSeguro();
    }
}

function renderizarRankingMes(rankingLista) {
    const contRanking = document.getElementById('listaClientesRanking');
    if (!contRanking) return;

    contRanking.innerHTML = '';
    if (!rankingLista || rankingLista.length === 0) {
        contRanking.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">Sin ventas en el período seleccionado.</p>';
        return;
    }

    const medallas = ['🥇', '🥈', '🥉'];
    rankingLista.slice(0, 3).forEach((c, idx) => {
        const div = document.createElement('div');
        div.className = 'ios-cliente-row compact';
        div.style.cursor = 'pointer';
        div.onclick = (e) => { e.preventDefault(); verDetalleCliente(c); };

        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.2rem;">${medallas[idx] || `#${idx + 1}`}</span>
                <div><strong>${formatNombrePrivado(c.nombre) || 'Cliente'}</strong></div>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <strong class="cifra-sensible" style="color:var(--accent); font-size:0.85rem; background: var(--accent-light); padding: 4px 8px; border-radius: 12px; display:inline-block; text-align:center; min-width: 70px;">
                    ${c.total_croissants || 0} Clás.<br>
                    <span style="font-size:0.75rem; color:#B45309;">${c.total_pops || 0} Pops</span>
                </strong>
                <span style="color:#CBD5E1; font-weight:bold; font-size:1rem;">></span>
            </div>
        `;
        contRanking.appendChild(div);
    });
}

function abrirModalEditarCliente() {
    if (!clienteDetalleActual) return;
    const clienteObj = clienteDetalleActual;

    Swal.fire({
        title: `Editar Cliente`,
        customClass: { popup: 'croiss-swal-popup', title: 'croiss-swal-title', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel', denyButton: 'croiss-btn-danger' },
        buttonsStyling: false,
        html: `
            <div style="text-align: left; margin-top: 14px;">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Nombre del Cliente</label>
                <input type="text" id="editNombreInput" class="croiss-swal-input" value="${clienteObj.nombre || ''}">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Teléfono</label>
                <input type="text" id="editTelInput" class="croiss-swal-input" value="${clienteObj.telefono || ''}">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Email</label>
                <input type="email" id="editEmailInput" class="croiss-swal-input" value="${clienteObj.email || ''}">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Dirección</label>
                <input type="text" id="editDirInput" class="croiss-swal-input" value="${clienteObj.direccion || ''}">
            </div>
        `,
        showCancelButton: true, showDenyButton: true,
        confirmButtonText: 'Guardar Cambios', denyButtonText: '🗑️ Eliminar Cliente', cancelButtonText: 'Cancelar',
        preConfirm: () => {
            const nomNuevo = document.getElementById('editNombreInput').value.trim();
            if (!nomNuevo) { Swal.showValidationMessage('El nombre no puede estar vacío.'); return false; }
            return {
                id_cliente: clienteObj.id_cliente || '',
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
                const res = await fetch('/api/cliente/editar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(result.value) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cliente Actualizado', 'Todos los datos se guardaron correctamente.');
                    cargarClientes();
                    volverASeccionAnterior();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo actualizar la información', 'error'); }
            finally { cerrarCroissLoaderSeguro(); }
        } else if (result.isDenied) {
            confirmarEliminarCliente(clienteObj.nombre);
        }
    });
}

function confirmarEliminarCliente(nombreCliente) {
    Swal.fire({
        title: `¿Eliminar cliente?`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted);">Se removerá a <strong style="color:var(--text-main);">${nombreCliente}</strong> del directorio.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-btn-danger', cancelButton: 'croiss-swal-cancel' }
    }).then(async (resConf) => {
        if (resConf.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/cliente/eliminar', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ nombre: nombreCliente }) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cliente Eliminado', `${nombreCliente} fue removido.`);
                    cargarClientes();
                    volverASeccionAnterior();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
            finally { cerrarCroissLoaderSeguro(); }
        }
    });
}

function volverASeccionAnterior() {
    cambiarSegmentoCliente(datosClientesGlobal.subOrigen || 'lista');
}

// ==========================================
// GASTOS Y COMPRAS
// ==========================================
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
        if (catEl.value === 'Embalaje' && unidadEl) unidadEl.value = 'un';
    }
}

function seleccionarInsumoRapido(nombreInsumo, unidadPredeterminada = '') {
    const descEl = document.getElementById('gDescripcion');
    const unidadEl = document.getElementById('gUnidad');
    if (descEl) descEl.value = nombreInsumo;
    if (unidadEl && unidadPredeterminada) unidadEl.value = unidadPredeterminada;
}

async function eliminarGasto(numFila, descGasto) {
    Swal.fire({
        title: `¿Eliminar este registro?`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted);">Se removerá <strong style="color:var(--text-main);">${descGasto}</strong> del historial.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-btn-danger', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/eliminar_gasto', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ fila: numFila }) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Registro Eliminado', 'Se removió la transacción.');
                    cargarInsumosYGastos();
                    if (typeof cargarBalance === 'function') cargarBalance();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
            finally { cerrarCroissLoaderSeguro(); }
        }
    });
}

// ==========================================
// NAVEGACIÓN Y TABS
// ==========================================
function cambiarTab(e, tab) {
    const btnTarget = e.currentTarget;
    if (!btnTarget) return;

    const yaEstaActivo = btnTarget.classList.contains('active');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    if (yaEstaActivo) {
        const homeSec = document.getElementById('sec-home');
        if (homeSec) homeSec.classList.add('active');
    } else {
        btnTarget.classList.add('active');
        const targetSec = document.getElementById('sec-' + tab);
        if (targetSec) targetSec.classList.add('active');

        // Precarga unificada al entrar a cada sección principal
        if(tab === 'ventas') cargarStock();
        if(tab === 'entregas') cargarTodaLaSeccionAgenda(true);
        if(tab === 'stock') cargarTodaLaSeccionStock(true);
        if(tab === 'gastos') cargarTodaLaSeccionGastos(true);
        if(tab === 'balance') cargarBalance();
        if(tab === 'clientes') cargarClientes();
    }
}

async function cargarStockPop() {
    try {
        const res = await fetch('/api/stock/pop');
        const data = await res.json();
        if (data.status === 'exito') {
            const elPopCong = document.getElementById('cantPopCongelados');
            const elMasasPop = document.getElementById('cantMasasPop');
            if (elPopCong) elPopCong.innerText = `${data.pop_congelados !== undefined ? data.pop_congelados : 0} un.`;
            if (elMasasPop) elMasasPop.innerText = `${data.pop_masas !== undefined ? data.pop_masas : 0} masas`;
        }
    } catch (err) {
        console.error("Error al cargar stock Pop:", err);
    }
}

async function cargarTodaLaSeccionStock(mostrarLoader = true) {
    const tInicio = Date.now();
    if (mostrarLoader) mostrarCroissLoader();

    try {
        await Promise.all([
            fetch('/api/stock/congelados').then(r => r.json()).then(d => {
                if (d.status === 'exito') actualizarUIStockCongelados(d);
            }).catch(e => console.error(e)),
            cargarStockPop(),
            cargarStock(true),
            cargarInsumosYGastos(false)
        ]);
        if (mostrarLoader) await esperarAnimacionMinima(tInicio, 1800);
    } catch (err) {
        console.error("Error al cargar la sección Stock:", err);
    } finally {
        if (mostrarLoader) cerrarCroissLoaderSeguro();
    }
}
function cambiarSegmentoEntrega(segmento) {
    const btnCue = document.getElementById('segBtnCuentas');
    const btnEnt = document.getElementById('segBtnEntregas');
    const btnAge = document.getElementById('segBtnAgenda');
    if (btnCue) btnCue.classList.toggle('active', segmento === 'cuentas');
    if (btnEnt) btnEnt.classList.toggle('active', segmento === 'entregas');
    if (btnAge) btnAge.classList.toggle('active', segmento === 'agenda');
    
    const subCue = document.getElementById('subSecCuentas');
    const subEnt = document.getElementById('subSecEntregas');
    const subAge = document.getElementById('subSecAgenda');
    if (subCue) subCue.classList.toggle('active', segmento === 'cuentas');
    if (subEnt) subEnt.classList.toggle('active', segmento === 'entregas');
    if (subAge) subAge.classList.toggle('active', segmento === 'agenda');
}

function cambiarSegmentoGasto(segmento) {
    const btnNue = document.getElementById('segBtnNuevoGasto');
    const btnHis = document.getElementById('segBtnHistorialGasto');
    const btnPre = document.getElementById('segBtnPreciosInsumos');
    if (btnNue) btnNue.classList.toggle('active', segmento === 'nuevo');
    if (btnHis) btnHis.classList.toggle('active', segmento === 'historial');
    if (btnPre) btnPre.classList.toggle('active', segmento === 'precios');

    const subNue = document.getElementById('subSecNuevoGasto');
    const subHis = document.getElementById('subSecHistorialGasto');
    const subPre = document.getElementById('subSecPreciosInsumos');
    if (subNue) subNue.classList.toggle('active', segmento === 'nuevo');
    if (subHis) subHis.classList.toggle('active', segmento === 'historial');
    if (subPre) subPre.classList.toggle('active', segmento === 'precios');
}

// ==========================================
// FORMULARIOS DE REGISTRO (SUBMIT LISTENERS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    const formFinalizarPedido = document.getElementById('formFinalizarPedido');
    if (formFinalizarPedido) {
        formFinalizarPedido.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (typeof carrito === 'undefined' || carrito.length === 0) {
                Swal.fire('Carrito vacío', 'Agrega al menos un producto al pedido.', 'warning');
                return;
            }

            const descuentoSelect = document.getElementById('vDescuento');
            const descuentoPorcentaje = descuentoSelect ? (parseFloat(descuentoSelect.value) || 0) : 0;

            const totalBruto = carrito.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0);
            const montoFinalNeto = Math.max(0, Math.round(totalBruto * (1 - (descuentoPorcentaje / 100))));

            const tInicio = Date.now();
            mostrarCroissLoader();

            const carritoProcesado = carrito.map(item => {
                let detalleSalsas = (item.salsas && item.salsas.length > 0) ? ` (Salsas: ${item.salsas.join(', ')})` : '';
                return {
                    producto: item.producto + detalleSalsas,
                    cantidad: item.cantidad,
                    con_jalea: item.con_jalea
                };
            });

            const payload = {
                fecha: getInputValueSafe('vFecha', hoy),
                fecha_entrega: getInputValueSafe('vFechaEntrega', hoy),
                cliente: getInputValueSafe('vCliente', 'Consumidor Final'),
                telefono: getInputValueSafe('vTelefonoCliente'),
                email: getInputValueSafe('vEmailCliente'),
                direccion: getInputValueSafe('vDireccionCliente'),
                items: carritoProcesado,
                monto_total: montoFinalNeto,
                descuento: descuentoPorcentaje,
                estado: getInputValueSafe('vEstado', 'Pendiente'),
                medio_pago: getInputValueSafe('vMedio', 'Efectivo'),
                notas: getInputValueSafe('vNotasCliente')
            };

            try {
                const res = await fetch('/api/venta', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    carrito = [];
                    renderizarCarrito();
                    formFinalizarPedido.reset();
                    if(document.getElementById('vFecha')) document.getElementById('vFecha').value = hoy;
                    if(document.getElementById('vFechaEntrega')) document.getElementById('vFechaEntrega').value = hoy;
                    if(document.getElementById('vDescuento')) document.getElementById('vDescuento').value = '0';

                    let msjExito = payload.email ? 'Se envió el correo de confirmación al cliente.' : 'El pedido se guardó correctamente en la agenda.';
                    
                    if (data.alertas && data.alertas.length > 0) {
                        let alertasHtml = data.alertas.map(a => `<li>${a}</li>`).join('');
                        Swal.fire({
                            title: 'Pedido Registrado ✅',
                            html: `
                                <p style="font-size:0.88rem; color:var(--text-muted);">${msjExito}</p>
                                <div style="background:#FEF2F2; border:1px solid #FCA5A5; border-radius:12px; padding:12px; margin-top:16px; text-align:left;">
                                    <strong style="color:#DC2626; font-size:0.85rem;">⚠️ STOCK BAJO:</strong>
                                    <ul style="color:#991B1B; font-size:0.8rem; margin:6px 0 0 16px; padding:0;">${alertasHtml}</ul>
                                </div>
                            `,
                            icon: 'warning', confirmButtonText: 'Entendido', customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' }
                        });
                    } else {
                        mostrarCroissExito('Pedido Registrado!', msjExito);
                    }

                    if (typeof cargarTodaLaSeccionAgenda === 'function') cargarTodaLaSeccionAgenda(false);
                    if (typeof cargarStock === 'function') cargarStock();
                } else {
                    Swal.fire('Error', data.mensaje || 'Error al guardar pedido', 'error');
                }
            } catch (err) {
                console.error("Error en submit de venta:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            } finally {
                cerrarCroissLoaderSeguro();
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
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Compra / Gasto Registrado!', 'Se actualizó el historial y el stock de insumos.');
                    formGasto.reset();
                    if(document.getElementById('gFecha')) document.getElementById('gFecha').value = hoy;
                    toggleCamposMateriaPrima();
                    cargarInsumosYGastos();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
            finally { cerrarCroissLoaderSeguro(); }
        });
    }

    cargarStock();
    toggleCamposMateriaPrima();
});

async function enviarRecordatorioPago(numFila, clienteNombre) {
    Swal.fire({
        title: `¿Enviar recordatorio de pago?`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted);">Se le enviará un correo a <strong style="color:var(--text-main);">${clienteNombre}</strong> recordando que su pedido está pendiente de pago.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, enviar mail', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/recordatorio_pago', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila })
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 1800);

                if (data.status === 'exito') {
                    mostrarCroissExito('Recordatorio Enviado', data.mensaje);
                } else { Swal.fire('Atención', data.mensaje, 'warning'); }
            } catch (err) { Swal.fire('Error', 'No se pudo enviar el correo', 'error'); }
            finally { cerrarCroissLoaderSeguro(); }
        }
    });
}

// ==========================================
// PLACA DE INSTAGRAM PARA EL GANADOR DEL MES
// ==========================================
function abrirPlacaGanador() {
    const ranking = datosClientesGlobal.ranking || [];
    if (!ranking || ranking.length === 0) {
        Swal.fire('Sin Datos', 'Aún no hay compras registradas en este período para generar la placa.', 'warning');
        return;
    }

    const top1 = ranking[0] ? formatNombrePrivado(ranking[0].nombre) : 'Sin ganador';
    const top2 = ranking[1] ? formatNombrePrivado(ranking[1].nombre) : '-';
    const top3 = ranking[2] ? formatNombrePrivado(ranking[2].nombre) : '-';

    const inputMes = document.getElementById('cMesFilter');
    let mesTexto = 'DEL MES';
    if (inputMes && inputMes.value) {
        const [anio, mesNum] = inputMes.value.split('-');
        const mesesNombres = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const idx = parseInt(mesNum, 10) - 1;
        if (mesesNombres[idx]) {
            mesTexto = `${mesesNombres[idx]} ${anio}`;
        }
    }

    const win = window.open('', '_blank');
    if (!win) {
        Swal.fire('Atención', 'Tu navegador bloqueó la apertura de la pestaña. Permite las ventanas emergentes para ver la placa.', 'warning');
        return;
    }

    win.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>EL GANADOR · CROISS</title>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800;900&display=swap" rel="stylesheet">
            <style>
                * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', -apple-system, sans-serif; }
                body {
                    background-color: #120C0A;
                    color: #FFFFFF;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 20px;
                    position: relative;
                }
                .btn-close-plaque {
                    position: fixed;
                    top: 15px;
                    right: 15px;
                    background: rgba(255, 255, 255, 0.15);
                    color: #FFFFFF;
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    padding: 8px 18px;
                    border-radius: 20px;
                    font-weight: 700;
                    font-size: 0.85rem;
                    cursor: pointer;
                    backdrop-filter: blur(8px);
                    z-index: 999;
                    transition: background 0.2s;
                }
                .btn-close-plaque:active {
                    background: rgba(255, 255, 255, 0.3);
                }
                .story-card {
                    width: 100%;
                    max-width: 410px;
                    height: 730px;
                    background: linear-gradient(180deg, #2D1E18 0%, #140D0A 100%);
                    border-radius: 36px;
                    border: 1.5px solid rgba(200, 109, 40, 0.4);
                    box-shadow: 0 25px 60px rgba(0,0,0,0.7);
                    padding: 45px 24px 35px 24px;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    align-items: center;
                    text-align: center;
                    position: relative;
                    overflow: hidden;
                }
                .bg-glow {
                    position: absolute;
                    top: -40px;
                    left: 50%;
                    transform: translateX(-50%);
                    width: 300px;
                    height: 300px;
                    background: radial-gradient(circle, rgba(200,109,40,0.35) 0%, rgba(0,0,0,0) 70%);
                    pointer-events: none;
                }
                .brand-header { z-index: 1; }
                .brand-logo {
                    font-size: 2.3rem;
                    font-weight: 900;
                    letter-spacing: 6px;
                    color: #FFFFFF;
                    text-transform: uppercase;
                }
                .brand-sub {
                    font-size: 0.75rem;
                    letter-spacing: 3px;
                    color: #E2A06E;
                    text-transform: uppercase;
                    margin-top: 4px;
                    font-weight: 600;
                }
                .award-title-box { z-index: 1; }
                .tag-mes {
                    background: rgba(200, 109, 40, 0.2);
                    color: #E2A06E;
                    border: 1px solid rgba(200, 109, 40, 0.4);
                    padding: 6px 18px;
                    border-radius: 20px;
                    font-size: 0.75rem;
                    font-weight: 800;
                    letter-spacing: 2px;
                    text-transform: uppercase;
                    display: inline-block;
                    margin-bottom: 12px;
                }
                .main-title {
                    font-size: 2rem;
                    font-weight: 900;
                    color: #FFFFFF;
                    line-height: 1.1;
                    letter-spacing: 1px;
                }
                .winners-container {
                    width: 100%;
                    z-index: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                .winner-box-1 {
                    background: linear-gradient(135deg, #C86D28 0%, #9A4D15 100%);
                    border-radius: 22px;
                    padding: 22px 16px;
                    box-shadow: 0 12px 30px rgba(200, 109, 40, 0.4);
                    border: 1.5px solid rgba(255, 255, 255, 0.3);
                }
                .winner-box-1 .crown { font-size: 2rem; display: block; margin-bottom: 2px; }
                .winner-box-1 .label {
                    font-size: 0.7rem;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 2px;
                    color: rgba(255,255,255,0.85);
                }
                .winner-box-1 .name {
                    font-size: 1.45rem;
                    font-weight: 900;
                    color: #FFFFFF;
                    margin-top: 4px;
                    word-break: break-word;
                }
                .runner-ups {
                    display: flex;
                    gap: 10px;
                    width: 100%;
                }
                .runner-box {
                    flex: 1;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 18px;
                    padding: 14px 10px;
                }
                .runner-box .icon { font-size: 1.2rem; display: block; margin-bottom: 2px; }
                .runner-box .label {
                    font-size: 0.62rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: #A09088;
                }
                .runner-box .name {
                    font-size: 0.9rem;
                    font-weight: 800;
                    color: #FFFFFF;
                    margin-top: 4px;
                    word-break: break-word;
                }
                .footer-brand {
                    z-index: 1;
                    font-size: 0.8rem;
                    color: #A09088;
                    font-weight: 700;
                    letter-spacing: 1px;
                }
            </style>
        </head>
        <body>
            <button class="btn-close-plaque" onclick="window.close()">✕ Cerrar Placa</button>

            <div class="story-card">
                <div class="bg-glow"></div>
                
                <div class="brand-header">
                    <div class="brand-logo">CROISS</div>
                    <div class="brand-sub">Artesanos del Croissant</div>
                </div>

                <div class="award-title-box">
                    <span class="tag-mes">${mesTexto}</span>
                    <h1 class="main-title">EL GANADOR</h1>
                </div>

                <div class="winners-container">
                    <div class="winner-box-1">
                        <span class="crown">👑</span>
                        <span class="label">1° Puesto</span>
                        <div class="name">${top1}</div>
                    </div>

                    <div class="runner-ups">
                        <div class="runner-box">
                            <span class="icon">🥈</span>
                            <span class="label">2° Puesto</span>
                            <div class="name">${top2}</div>
                        </div>
                        <div class="runner-box">
                            <span class="icon">🥉</span>
                            <span class="label">3° Puesto</span>
                            <div class="name">${top3}</div>
                        </div>
                    </div>
                </div>

                <div class="footer-brand">
                    @croiss.uy
                </div>
            </div>
        </body>
        </html>
    `);
    win.document.close();
}

async function cargarTodaLaSeccionGastos(mostrarLoader = true) {
    const tInicio = Date.now();
    if (mostrarLoader) mostrarCroissLoader();

    try {
        await Promise.all([
            cargarInsumosYGastos(false),
            cargarPreciosInsumos(false)
        ]);
        toggleCamposMateriaPrima();
        if (mostrarLoader) await esperarAnimacionMinima(tInicio, 1800);
    } catch (err) {
        console.error("Error cargando sección Gastos:", err);
    } finally {
        if (mostrarLoader) cerrarCroissLoaderSeguro();
    }
}

async function cargarInsumosYGastos(conLoader = true) {
    const tInicio = Date.now();
    if (conLoader) mostrarCroissLoader();

    try {
        const res = await fetch('/api/gastos_e_insumos');
        const data = await res.json();

        if (conLoader) await esperarAnimacionMinima(tInicio, 1800);

        if (data.status === 'exito') {
            const contMateriaPrima = document.getElementById('listaMateriaPrimaStock');
            const contEmpaque = document.getElementById('listaEmpaqueStock');
            const PalabrasEmpaque = ["caja", "papel", "film", "bolsa", "embalaje", "etiqueta", "cinta", "cajas"];

            let htmlMateriaPrima = '', htmlEmpaque = '';

            if (data.insumos && data.insumos.length > 0) {
                data.insumos.forEach(ins => {
                    const nombreInsumo = ins.Insumo || 'Insumo';
                    const stockVal = ins['Stock Actual'] !== undefined ? ins['Stock Actual'] : 0;
                    const unidadVal = ins.Unidad || '';
                    const vencFecha = ins['Vencimiento Proximo'] || ins['Vencimiento Próximo'] || 'Sin fecha';
                    const esEmpaque = PalabrasEmpaque.some(p => nombreInsumo.toLowerCase().includes(p));

                    const nomEscapado = nombreInsumo.replace(/'/g, "\\'");
                    const vencEscapado = vencFecha.replace(/'/g, "\\'");

                    const itemHtml = `
                        <div class="ios-cliente-row compact" style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong>${nombreInsumo}</strong><br>
                                <small style="color:var(--text-muted);">${vencFecha !== 'Sin fecha' ? 'Vence: ' + vencFecha : 'Control de Stock'}</small>
                            </div>
                            <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                                <strong style="color:var(--accent); font-size:1.05rem;">${stockVal} ${unidadVal}</strong>
                                <div style="display: flex; gap: 4px;">
                                    <button type="button" class="btn-jalea-chip active" style="font-size:0.7rem; padding: 2px 8px; margin:0;" onclick="abrirModalEditarInsumo('${nomEscapado}', ${stockVal}, '${unidadVal}', '${vencEscapado}')">Editar</button>
                                    <button type="button" class="btn-remove" style="font-size:0.68rem; padding: 2px 6px;" onclick="eliminarInsumoDirecto('${nomEscapado}')">X</button>
                                </div>
                            </div>
                        </div>
                    `;

                    if (esEmpaque) htmlEmpaque += itemHtml;
                    else htmlMateriaPrima += itemHtml;
                });
            }

            if (contMateriaPrima) contMateriaPrima.innerHTML = htmlMateriaPrima || '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay materias primas registradas.</p>';
            if (contEmpaque) contEmpaque.innerHTML = htmlEmpaque || '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay cajas/empaques registrados.</p>';

            const contGastos = document.getElementById('listaGastosHistorico');
            if (contGastos) {
                contGastos.innerHTML = '';
                if (!data.gastos || data.gastos.length === 0) {
                    contGastos.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay gastos cargados.</p>';
                } else {
                    data.gastos.forEach(g => {
                        const desc = g.Descripcion || g.descripcion || 'Gasto';
                        const cat = g.Categoria || g.categoria || 'Otros';
                        const fecha = g.Fecha || g.fecha || '';
                        const monto = g.Monto || g.monto || 0;
                        const cant = g.Cantidad || g.cantidad || 1;
                        const unidad = g.Unidad || g.unidad || '';
                        const numFila = g.fila;
                        const descEscapada = desc.replace(/'/g, "\\'");

                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>Fecha: ${fecha} - ${desc}</strong> <small style="color:#64748b;">(${cat})</small><br>
                                <span style="font-size:0.85rem; color:#475569;">Cant: ${cant} ${unidad}</span>
                            </div>
                            <div style="text-align:right;">
                                <strong style="color:#dc2626; font-size:0.95rem;">-$${monto}</strong><br>
                                ${numFila ? `<button type="button" class="btn-remove" style="font-size:0.68rem; padding:2px 6px; margin-top:4px;" onclick="eliminarGasto(${numFila}, '${descEscapada}')">Eliminar</button>` : ''}
                            </div>
                        `;
                        contGastos.appendChild(div);
                    });
                }
            }
        }
    } catch (err) {
        console.error("Error cargando inventario:", err);
    } finally {
        if (conLoader) cerrarCroissLoaderSeguro();
    }
}

async function cargarPreciosInsumos(conLoader = true) {
    const tInicio = Date.now();
    if (conLoader) mostrarCroissLoader();

    try {
        const res = await fetch('/api/precios_insumos');
        const responseData = await res.json();

        if (conLoader) await esperarAnimacionMinima(tInicio, 1800);

        if (responseData.status === 'exito') {
            const data = responseData.datos;
            
            const lblCroiss = document.getElementById('lblCostCroissBase');
            const lblPop = document.getElementById('lblCostPopBase');
            if (lblCroiss) lblCroiss.innerText = `$${data.croissant_base}`;
            if (lblPop) lblPop.innerText = `$${data.pop_base}`;

            const cont = document.getElementById('contenedorListaPreciosInsumos');
            if (cont && data.precios_lista) {
                cont.innerHTML = '';
                
                const labelsDict = {
                    "harina 000": "Harina 000 (1 Kg)",
                    "manteca": "Manteca (1 Kg)",
                    "leche": "Leche (1 Litro)",
                    "azucar": "Azúcar (1 Kg)",
                    "sal": "Sal (1 Kg)",
                    "vainilla": "Vainilla (1 Litro)",
                    "levadura (sobre 12g)": "Levadura (1 Sobre de 12g)",
                    "huevos (unidad)": "Huevo (1 Unidad)",
                    "dulce de leche": "Dulce de Leche (1 Kg)",
                    "jamon/queso": "Jamón / Queso (1 Kg)",
                    "caja x6": "Caja X6 (1 Unidad)",
                    "caja x3": "Caja X3 (1 Unidad)",
                    "caja x1": "Caja X1 (1 Unidad)"
                };

                Object.keys(data.precios_lista).forEach(key => {
                    const labelTexto = labelsDict[key] || key;
                    const valor = data.precios_lista[key];

                    const div = document.createElement('div');
                    div.className = 'form-group';
                    div.style.marginBottom = '10px';
                    div.innerHTML = `
                        <label style="font-size:0.8rem; font-weight:700;">${labelTexto}</label>
                        <input type="number" class="input-precio-insumo" data-key="${key}" value="${valor}" step="0.1" min="0" required style="font-size:0.9rem; padding:8px 12px;">
                    `;
                    cont.appendChild(div);
                });
            }
        }
    } catch (err) {
        console.error("Error al cargar precios de insumos:", err);
    } finally {
        if (conLoader) cerrarCroissLoaderSeguro();
    }
}

async function guardarPreciosInsumos(e) {
    e.preventDefault();
    
    const inputs = document.querySelectorAll('.input-precio-insumo');
    const preciosActualizados = {};
    
    inputs.forEach(input => {
        const key = input.getAttribute('data-key');
        const val = parseFloat(input.value) || 0;
        preciosActualizados[key] = val;
    });

    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/precios_insumos', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ precios: preciosActualizados })
        });
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 1800);

        if (data.status === 'exito') {
            mostrarCroissExito('Precios Actualizados', 'Los costos de producción se recalcularon correctamente.');
            cargarPreciosInsumos();
            if (typeof cargarBalance === 'function') cargarBalance();
        } else {
            Swal.fire('Error', data.mensaje, 'error');
        }
    } catch (err) {
        console.error("Error guardando precios:", err);
        Swal.fire('Error', 'No se pudo guardar la información', 'error');
    } finally {
        cerrarCroissLoaderSeguro();
    }
}

async function cargarControlVisibilidadMenu() {
    const cont = document.getElementById('listaControlVisibilidadMenu');
    if (!cont) return;

    try {
        const res = await fetch('/api/menu_visibilidad');
        const data = await res.json();
        const estadoMenu = data.estado || {};

        cont.innerHTML = '';

        if (!catalogoProductos || catalogoProductos.length === 0) {
            cont.innerHTML = '<p style="font-size:0.8rem; color:#94a3b8; text-align:center;">Cargando menú...</p>';
            return;
        }

        catalogoProductos.forEach(prod => {
            const nombre = obtenerNombreDesdeObjeto(prod);
            const nameLower = (nombre || '').toLowerCase();

            if (!nombre || nameLower.includes('congelado') || nameLower.includes('sobrevendido') || nameLower.includes('masa')) return;

            const estaActivo = estadoMenu[nameLower] !== false;
            const checkedAttr = estaActivo ? 'checked' : '';
            const statusText = estaActivo ? '<span style="color:#16A34A; font-weight:800;">ON (Visible)</span>' : '<span style="color:#DC2626; font-weight:800;">OFF (Oculto)</span>';

            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--border-color); font-size: 0.88rem;';
            div.innerHTML = `
                <div>
                    <strong>${nombre}</strong><br>
                    <small id="txtStatus-${nameLower.replace(/[^a-z0-0]/gi, '')}">${statusText}</small>
                </div>
                <label style="position: relative; display: inline-block; width: 44px; height: 24px; margin: 0;">
                    <input type="checkbox" ${checkedAttr} onchange="cambiarVisibilidadMenuTienda('${nombre.replace(/'/g, "\\'")}', this.checked)" style="opacity: 0; width: 0; height: 0;">
                    <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${estaActivo ? '#16A34A' : '#CBD5E1'}; transition: .3s; border-radius: 24px;">
                        <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${estaActivo ? '22px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%;"></span>
                    </span>
                </label>
            `;
            cont.appendChild(div);
        });
    } catch (e) {
        console.error("Error cargando interruptores de menú:", e);
    }
}

function renderizarMenuYStock() {
    const select = document.getElementById('vProductoSelect');
    const lista = document.getElementById('listaStock');
    const seleccionPrevia = select ? select.value : '';

    if (select) select.innerHTML = '<option value="" disabled selected>Seleccionar croissant...</option>';

    if (!catalogoProductos || catalogoProductos.length === 0) return;

    let productosRenderizados = 0;
    catalogoProductos.forEach(prod => {
        const nombreProd = obtenerNombreDesdeObjeto(prod);
        const nameLower = (nombreProd || '').toLowerCase();

        if (!nombreProd || nameLower.includes('congelado') || nameLower.includes('sobrevendido') || nameLower.includes('masa')) return;

        productosRenderizados++;

        if (select) {
            const opt = document.createElement('option');
            opt.value = nombreProd;
            opt.innerText = nombreProd;
            select.appendChild(opt);
        }
    });

    if (select && seleccionPrevia) {
        const existe = Array.from(select.options).some(o => o.value === seleccionPrevia);
        if (existe) select.value = seleccionPrevia;
    }

    if (lista) {
        (async () => {
            let estadoMenu = {};
            try {
                const res = await fetch('/api/menu_visibilidad');
                const data = await res.json();
                estadoMenu = data.estado || {};
            } catch (e) {
                console.error("Error leyendo visibilidad del menú:", e);
            }

            lista.innerHTML = '';
            let contStock = 0;
            catalogoProductos.forEach(prod => {
                const nombreProd = obtenerNombreDesdeObjeto(prod);
                const nameLower = (nombreProd || '').toLowerCase();

                if (!nombreProd || nameLower.includes('congelado') || nameLower.includes('sobrevendido') || nameLower.includes('masa')) return;

                contStock++;
                const precioVenta = obtenerPrecioDesdeObjeto(prod);
                const nomEscapado = nombreProd.replace(/'/g, "\\'");
                const estaActivo = estadoMenu[nameLower] !== false;
                const statusBadge = estaActivo 
                    ? '<span style="color:#16A34A; font-weight:800; font-size:0.75rem;">ON</span>' 
                    : '<span style="color:#DC2626; font-weight:800; font-size:0.75rem;">OFF</span>';

                const div = document.createElement('div');
                div.className = 'stock-item';
                div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--border-color); gap: 10px;';

                div.innerHTML = `
                    <div style="flex: 1; min-width: 0;">
                        <strong style="font-size: 0.92rem; color: var(--text-main); display: block; word-break: break-word;">${nombreProd}</strong>
                        <small style="color: var(--text-muted); font-weight: 600;">$${precioVenta} c/u</small> · ${statusBadge}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
                        <button type="button" class="btn-jalea-chip active" style="font-size:0.75rem; padding: 5px 10px; margin: 0;" onclick="abrirModalRenombrarProducto('${nomEscapado}')">✏️ Nombre</button>

                        <label style="position: relative; display: inline-block; width: 44px; height: 24px; margin: 0; flex-shrink: 0;">
                            <input type="checkbox" ${estaActivo ? 'checked' : ''} onchange="cambiarVisibilidadMenuTienda('${nomEscapado}', this.checked)" style="opacity: 0; width: 0; height: 0;">
                            <span style="position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: ${estaActivo ? '#16A34A' : '#CBD5E1'}; transition: .3s; border-radius: 24px;">
                                <span style="position: absolute; content: ''; height: 18px; width: 18px; left: ${estaActivo ? '22px' : '3px'}; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%;"></span>
                            </span>
                        </label>
                    </div>
                `;
                lista.appendChild(div);
            });

            if (contStock === 0) {
                lista.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:15px 0;">No hay productos cargados en el menú.</p>';
            }
        })();
    }
}

async function enviarLinkPagoWhatsApp(numFila, clienteTelefono) {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/generar_link_pago', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fila: numFila })
        });
        const data = await res.json();
        await esperarAnimacionMinima(tInicio, 1800);

        if (data.status === 'exito') {
            let primerNombre = (data.cliente || '').trim().split(' ')[0];
            let telLimpio = (clienteTelefono || '').replace(/\D/g, '');
            if (telLimpio.startsWith('0')) telLimpio = telLimpio.substring(1);
            if (telLimpio && !telLimpio.startsWith('598')) telLimpio = '598' + telLimpio;

            let mensaje = `Hola ${primerNombre}, Te escribimos de CROISS 🥐\n\n` +
                `Tu pedido es de un total de *$${data.monto_original}*.\n\n` +
                `Opciones de Pago:\n\n` +
                `-Transferencia directa (Sin recargo):\n` +
                `• Itaú: 5584633\n` +
                `• Mercado Pago (Cuenta/CVU): 1003657866242\n\n` +
                `-Tarjeta / Link Mercado Pago (+ 8.5% comisión = $${data.monto_tarjeta}):\n` +
                `• Link de pago: ${data.link}\n\n` +
                `¡Muchas gracias!`;

            let urlWa = telLimpio 
                ? `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensaje)}`
                : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

            window.location.href = urlWa;
        } else {
            Swal.fire('Error', data.mensaje || 'No se pudo generar el link de pago.', 'error');
        }
    } catch (err) {
        Swal.fire('Error', 'No se pudo conectar con el servidor para generar Mercado Pago.', 'error');
    } finally {
        cerrarCroissLoaderSeguro();
    }
}
