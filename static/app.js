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
    
    // Nuevo: Adicional de $80 para Pain Au Chocolat
    if (nombre.includes('pain au chocolat') || nombre.includes('chocolat')) return 80;
    
    // Originales
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
    
    // Leer el estado del checkbox de regalo
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
        es_regalo: esRegalo, // NUEVO: Guardamos si es regalo
        precio_unitario: 0,
        subtotal: 0
    });

    if (cantInput) cantInput.value = 1;
    if (chkRegalo) chkRegalo.checked = false; // Reseteamos la casilla
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

        // Si es regalo, el subtotal es 0
        const subtotal = item.es_regalo ? 0 : (precioUnitario * item.cantidad);
        item.precio_unitario = precioUnitario;
        item.subtotal = subtotal;

        totalGeneralBruto += subtotal;

        const claseJalea = item.con_jalea ? 'active' : '';
        const textoJalea = item.con_jalea ? 'Con Jalea' : 'Sin Jalea';
        
        // Etiqueta visual de regalo
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

