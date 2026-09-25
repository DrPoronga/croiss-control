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
    
    if (nombre.includes('pain au chocolat') || nombre.includes('chocolat')) return 80;
    if (nombre.includes('jamon') || nombre.includes('queso') || nombre.includes('creme') || nombre.includes('crema') || nombre.includes('milano')) return 50;
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
    
    const chkRegalo = document.getElementById('vEsRegaloItem');
    const esRegalo = chkRegalo ? chkRegalo.checked : false;

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
        es_regalo: esRegalo,
        precio_unitario: 0,
        subtotal: 0
    });

    if (cantInput) cantInput.value = 1;
    if (chkRegalo) chkRegalo.checked = false;
    renderizarCarrito();
}

function actualizarSalsaItem(itemIndex, salsaIndex, valor) {
    if (carrito[itemIndex] && carrito[itemIndex].salsas) {
        carrito[itemIndex].salsas[salsaIndex] = valor;
    }
}

let cuponAplicado = null;

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
        if (item.producto.toLowerCase().includes('pop') || item.es_regalo) return sum;
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

        const subtotal = item.es_regalo ? 0 : (precioUnitario * item.cantidad);
        item.precio_unitario = precioUnitario;
        item.subtotal = subtotal;

        totalGeneralBruto += subtotal;

        const claseJalea = item.con_jalea ? 'active' : '';
        const textoJalea = item.con_jalea ? 'Con Jalea' : 'Sin Jalea';
        
        const badgeRegalo = item.es_regalo ? '<span style="background: #FEF3C7; color: #B45309; font-size: 0.65rem; padding: 2px 6px; border-radius: 8px; font-weight: 800; margin-left: 6px; vertical-align: middle;">🎁 REGALO</span>' : '';

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
                <strong>${item.cantidad}x ${item.producto}</strong>${badgeRegalo}<br>
                ${selectorJaleaHtml}
                ${selectorSalsasHtml}
                <small style="color:#64748b; display:block; margin-top:4px;">
                    ${item.es_regalo ? `<span style="text-decoration: line-through;">$${precioUnitario} c/u</span> <strong style="color: #16A34A;">Gratis</strong>` : `$${precioUnitario} c/u`}
                </small>
            </div>
            <div style="text-align: right;">
                <span style="font-weight: bold; margin-right: 8px; ${item.es_regalo ? 'color: #16A34A;' : ''}">$${subtotal}</span>
                <button type="button" class="btn-remove" onclick="eliminarDelCarrito(${index})">X</button>
            </div>
        `;
        listEl.appendChild(div);
    });

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
                const itemCreme = { "Nombre": "Croiss a la Creme", "Precio Venta": 190 };
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

            const existeChocolat = catalogoProductos.some(p => {
                const nom = obtenerNombreDesdeObjeto(p).toLowerCase();
                return nom.includes('chocolat');
            });

            if (!existeChocolat) {
                catalogoProductos.push({ "Nombre": "Pain Au Chocolat", "Precio Venta": 220 });
            }

            renderizarMenuYStock();
        }
    } catch (err) {
        console.error("Error al cargar stock:", err);
    } finally {
        isFetchingStock = false;
    }
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
            let descuentoPorcentaje = descuentoSelect ? (parseFloat(descuentoSelect.value) || 0) : 0;

            const totalBruto = carrito.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0);
            let montoDescuento = Math.round(totalBruto * (descuentoPorcentaje / 100));
            let tagCupon = '';

            if (typeof cuponAplicado !== 'undefined' && cuponAplicado) {
                if (cuponAplicado.tipo === '%') {
                    montoDescuento = Math.round(totalBruto * (cuponAplicado.valor / 100));
                    descuentoPorcentaje = cuponAplicado.valor;
                    tagCupon = `[Cupón: ${cuponAplicado.codigo}]`;
                } else {
                    montoDescuento = cuponAplicado.valor;
                    tagCupon = `[Cupón: ${cuponAplicado.codigo} -$${cuponAplicado.valor}]`;
                }
            }

            const montoFinalNeto = Math.max(0, totalBruto - montoDescuento);

            let notasCliente = getInputValueSafe('vNotasCliente');
            if (tagCupon) {
                notasCliente = `${tagCupon} ${notasCliente}`.trim();
            }

            const tInicio = Date.now();
            mostrarCroissLoader();

            const carritoProcesado = carrito.map(item => {
                let detalleSalsas = (item.salsas && item.salsas.length > 0) ? ` (Salsas: ${item.salsas.join(', ')})` : '';
                let detalleRegalo = item.es_regalo ? ' (Regalo)' : '';
                return {
                    producto: item.producto + detalleSalsas + detalleRegalo,
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
                cupon: (typeof cuponAplicado !== 'undefined' && cuponAplicado) ? cuponAplicado.codigo : '',
                estado: getInputValueSafe('vEstado', 'Pendiente'),
                medio_pago: getInputValueSafe('vMedio', 'Efectivo'),
                notas: notasCliente
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
                    cuponAplicado = null;
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

// ==========================================
// SOPORTE PARA REGALOS EN EDICIÓN DE PEDIDOS
// ==========================================
function parsearDescripcionAPedidos(desc) {
    if(!desc) return [];
    let partes = desc.split(',');
    let items = [];
    partes.forEach(p => {
        let itemClean = p.trim();
        if(!itemClean) return;
        let conJalea = itemClean.toLowerCase().includes('(con jalea)');
        let esRegalo = itemClean.toLowerCase().includes('(regalo)');

        let sinSufijosStr = itemClean.replace(/\(con jalea\)/gi, '').replace(/\(regalo\)/gi, '').trim();
        let match = sinSufijosStr.match(/^(\d+)x\s+(.+)/i);
        if(match) {
            items.push({ cantidad: parseInt(match[1]) || 1, producto: match[2].trim(), con_jalea: conJalea, es_regalo: esRegalo });
        } else {
            items.push({ cantidad: 1, producto: sinSufijosStr, con_jalea: conJalea, es_regalo: esRegalo });
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
                    <button type="button" class="btn-jalea-chip ${item.es_regalo ? 'active' : ''}" style="margin:0; font-size:0.75rem; padding:4px 10px; margin-left:6px; ${item.es_regalo ? 'background:#FEF3C7; color:#B45309; border-color:#FDE68A;' : ''}" onclick="toggleRegaloEdicion(${idx})">
                        ${item.es_regalo ? '🎁 Es Regalo' : 'Marcar Regalo'}
                    </button>
                </div>
            </div>
        `;
    });
    return html;
}

function toggleRegaloEdicion(idx) {
    if(itemsEdicionTemp[idx]) {
        itemsEdicionTemp[idx].es_regalo = !itemsEdicionTemp[idx].es_regalo;
        refrescarDomEdicion();
        recalcularTotalEdicion();
    }
}

function recalcularTotalEdicion() {
    let total = 0;
    let cantNormales = 0;

    itemsEdicionTemp.forEach(item => {
        if(!item.producto.toLowerCase().includes('pop') && !item.es_regalo) cantNormales += item.cantidad;
    });

    let precioBase = calcularPrecioBase(cantNormales);

    itemsEdicionTemp.forEach(item => {
        if (item.es_regalo) return;

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
        itemsEdicionTemp = [{ cantidad: 1, producto: 'Croissant Clásico', con_jalea: false, es_regalo: false }];
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

                let strJalea = item.con_jalea ? ' (Con Jalea)' : '';
                let strRegalo = item.es_regalo ? ' (Regalo)' : '';

                resumen.push(`${cant}x ${prodNombre}${strJalea}${strRegalo}`);
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
    itemsEdicionTemp.push({ cantidad: 1, producto: primerProducto, con_jalea: false, es_regalo: false });
    refrescarDomEdicion();
    recalcularTotalEdicion();
}

// ==========================================
// RESTO DE FUNCIONES OPERATIVAS Y NAVEGACIÓN
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

        if(tab === 'ventas') cargarStock();
        if(tab === 'entregas') cargarTodaLaSeccionAgenda(true);
        if(tab === 'stock') cargarTodaLaSeccionStock(true);
        if(tab === 'gastos') cargarTodaLaSeccionGastos(true);
        if(tab === 'balance') cargarBalance();
        if(tab === 'clientes') cargarClientes();
    }
}

async function cargarTodaLaSeccionAgenda(mostrarLoader = true) {
    const tInicio = Date.now();
    if (mostrarLoader) mostrarCroissLoader();

    try {
        await Promise.all([cargarCuentas(false), cargarAgenda(false)]);
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

                        let cantidadFormateada = String(p.cantidad).includes('un.') || String(p.cantidad).includes('Pop') ? p.cantidad : p.cantidad + ' un.';

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
                                        <span style="font-weight:800; color:#d97706; font-size:0.95rem;">${cantidadFormateada}</span>
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
                        let cantidadFormateada = String(p.cantidad).includes('un.') || String(p.cantidad).includes('Pop') ? p.cantidad : p.cantidad + ' un.';
                        
                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; gap: 12px;';
                        div.innerHTML = `
                            <div style="flex: 1; min-width: 0;">
                                <strong style="color: var(--text-main); font-size: 0.95rem;">${p.cliente}</strong> <small style="color:#64748b;">(${p.fecha_entrega})</small><br>
                                <span style="font-size:0.82rem; color:#475569; margin-top:2px; display:inline-block;">${p.producto} (${cantidadFormateada})</span><br>
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
                        let cantidadFormateada = String(e.cantidad).includes('un.') || String(e.cantidad).includes('Pop') ? e.cantidad : e.cantidad + ' un.';

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
                        let botonCobroOPago = '';

                        if (esGratis) {
                            botonCobroOPago = `<div class="agenda-badge badge-ok" style="display:flex; align-items:center; justify-content:center; margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; text-align:center; height:100%; box-sizing:border-box;">Cortesía $0</div>`;
                        } else if (esPagado) {
                            const telSeguro = e.telefono || '';
                            const prodSeguro = e.producto ? e.producto.replace(/'/g, "\\'") : '';
                            botonCobroOPago = `<button type="button" style="background:#DCFCE7; color:#15803D; margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; height:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; border:1px solid #BBF7D0; font-weight:800; cursor:pointer;" onclick="confirmarPagoWhatsApp('${clienteClean}', '${telSeguro}', ${e.monto}, '${e.fecha_entrega}', '${prodSeguro}')">💬 Conf. Pago</button>`;
                        } else {
                            botonCobroOPago = `<button type="button" class="btn-pagar-ahora" style="margin:0; padding:6px 4px; font-size:0.75rem; border-radius:10px; width:100%; height:100%; box-sizing:border-box; display:flex; align-items:center; justify-content:center; box-shadow:none; background:#16A34A;" onclick="marcarComoPagado(${e.fila}, '${clienteClean}')">💸 Pago</button>`;
                        }

                        div.innerHTML = `
                            <div style="flex: 1; padding-right: 12px;">
                                <strong style="color: var(--text-main); font-size: 0.95rem;">${e.fecha_entrega}</strong><br>
                                <strong style="color: var(--text-main); font-size: 0.9rem;">${e.cliente}</strong><br>
                                <span style="font-size:0.82rem; color:#475569; margin-top:2px; display:inline-block;">${e.producto} (${cantidadFormateada})</span><br>
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

            let dtoStr = '';
            if (data.notas) {
                const match = data.notas.match(/\[([^\]]*(?:Dto|Cupón|Cupon)[^\]]*)\]/i);
                if (match) dtoStr = `\n🎁 *Beneficio Aplicado:* ${match[1].toUpperCase()}`;
            }

            let itemsFormateados = (data.producto || 'Pedido CROISS')
                .split(',')
                .map(item => `  • ${item.trim()}`)
                .join('\n');

            let fechaStr = data.fecha_entrega ? `\n📅 *Fecha de Entrega:* ${data.fecha_entrega}` : '';

            let mensaje = `Hola ${primerNombre}, ¡te escribimos de CROISS! \n\n` +
                `📌 *DETALLE DE TU PEDIDO:*${fechaStr}\n` +
                `${itemsFormateados}${dtoStr}\n\n` +
                `───────────────\n` +
                `*MONTO TOTAL:* *$${data.monto_original}*\n` +
                `───────────────\n\n` +
                `💳 *FORMAS DE PAGO:*\n\n` +
                `1️⃣ *Transferencia Bancaria (Sin recargo - $${data.monto_original}):*\n` +
                `• Itaú: 5584633\n` +
                `• Mercado Pago (Cuenta/CVU): 1003657866242\n\n` +
                `2️⃣ *Tarjeta de Crédito / Débito (+8.5% comisión - $${data.monto_tarjeta}):*\n` +
                `• Link de pago: ${data.link}\n\n` +
                `Por favor envianos el comprobante por este medio una vez realizado. ¡Muchas gracias!`;

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

function confirmarPagoWhatsApp(nombreCliente, telefono, monto, fechaEntrega, producto) {
    if (!telefono) {
        Swal.fire('Sin teléfono', `El cliente ${nombreCliente} no tiene un teléfono registrado para enviar el mensaje.`, 'info');
        return;
    }

    let primerNombre = nombreCliente.trim().split(' ')[0];
    let telLimpio = telefono.replace(/\D/g, '');
    if (telLimpio.startsWith('0')) telLimpio = telLimpio.substring(1);
    if (telLimpio && !telLimpio.startsWith('598')) telLimpio = '598' + telLimpio;

    let itemsFormateados = producto.split(',').map(item => `  • ${item.trim()}`).join('\n');

    let mensaje = `¡Hola ${primerNombre}! Te escribimos de CROISS 🥐\n\n` +
                  `Te confirmamos que recibimos correctamente tu pago de *$${monto}*.\n\n` +
                  `Tu pedido para el *${fechaEntrega}* ya figura como PAGADO:\n` +
                  `${itemsFormateados}\n\n` +
                  `¡Muchas gracias por elegirnos! Nos contactaremos cuando vaya en camino. 🛵`;

    let urlWa = `https://wa.me/${telLimpio}?text=${encodeURIComponent(mensaje)}`;
    window.open(urlWa, '_blank');
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

function renderizarMenuYStock() {
    const select = document.getElementById('vProductoSelect');
    const lista = document.getElementById('listaStock');
    const seleccionPrevia = select ? select.value : '';

    if (select) select.innerHTML = '<option value="" disabled selected>Seleccionar croissant...</option>';
    if (!catalogoProductos || catalogoProductos.length === 0) return;

    catalogoProductos.forEach(prod => {
        const nombreProd = obtenerNombreDesdeObjeto(prod);
        const nameLower = (nombreProd || '').toLowerCase();
        if (!nombreProd || nameLower.includes('congelado') || nameLower.includes('sobrevendido') || nameLower.includes('masa')) return;

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
            } catch (e) { console.error(e); }

            lista.innerHTML = '';
            catalogoProductos.forEach(prod => {
                const nombreProd = obtenerNombreDesdeObjeto(prod);
                const nameLower = (nombreProd || '').toLowerCase();
                if (!nombreProd || nameLower.includes('congelado') || nameLower.includes('sobrevendido') || nameLower.includes('masa')) return;

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
        })();
    }
}