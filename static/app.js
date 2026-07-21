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

// Helper seguro para leer valores de inputs
function getInputValueSafe(id, defaultVal = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : defaultVal;
}

// Abrir Google Maps con la dirección
function abrirGoogleMaps(direccion) {
    if (!direccion) {
        Swal.fire('Sin Dirección', 'No hay una dirección registrada para este cliente/pedido.', 'info');
        return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccion)}`;
    window.open(url, '_blank');
}

function abrirGoogleMapsIngresado() {
    const dir = getInputValueSafe('vDireccionCliente');
    abrirGoogleMaps(dir);
}

// Cargar sugerencias de clientes registrados
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

// Auto-poblar Teléfono, Email y Dirección al seleccionar o tipear un cliente
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
                title: `👥 Datos de ${clienteEncontrado.nombre} cargados`,
                showConfirmButton: false,
                timer: 2000,
                background: '#FAF0EB',
                color: '#2D1E18'
            });
        }
    }
}

// Cambiar de solapa principal
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
        if(tab === 'gastos') toggleCamposMateriaPrima();
        if(tab === 'balance') { cargarBalance(); cargarStock(); }
        if(tab === 'clientes') cargarClientes();
    }
}

// Sub-navegaciones
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

// Alterna visibilidad de campos y sugerencias según la categoría elegida
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

// Carga el nombre y la unidad predeterminada en un toque
function seleccionarInsumoRapido(nombreInsumo, unidadPredeterminada = '') {
    const descEl = document.getElementById('gDescripcion');
    const unidadEl = document.getElementById('gUnidad');

    if (descEl) descEl.value = nombreInsumo;
    if (unidadEl && unidadPredeterminada) unidadEl.value = unidadPredeterminada;
}

// Cargar Stock de Productos (Protegido contra peticiones duplicadas en segundo plano)
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

// Dibuja el menú desplegable y conserva la selección actual
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
        if (!nombreProd) return;

        if (select) {
            const opt = document.createElement('option');
            opt.value = nombreProd;
            opt.innerText = nombreProd;
            select.appendChild(opt);
        }

        if (lista) {
            const stockCant = prod['Stock Actual'] !== undefined ? prod['Stock Actual'] : (prod['Stock'] || 0);
            const precioVenta = prod['Precio Venta'] !== undefined ? prod['Precio Venta'] : (prod['Precio'] || 0);

            const div = document.createElement('div');
            div.className = 'stock-item clickable';
            div.onclick = () => editarStockProducto(nombreProd, stockCant, precioVenta);
            div.innerHTML = `
                <div>
                    <strong>${nombreProd}</strong><br>
                    <small style="color:var(--text-muted);">$${precioVenta} c/u</small>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="stock-cant">${stockCant} un.</span>
                    <span style="color:#CBD5E1; font-weight:bold; font-size:1.1rem;">›</span>
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

function editarStockProducto(prodNombre, stockActual, precioActual) {
    Swal.fire({
        title: `🥐 ${prodNombre}`,
        customClass: {
            popup: 'croiss-swal-popup',
            title: 'croiss-swal-title',
            confirmButton: 'croiss-swal-confirm',
            cancelButton: 'croiss-swal-cancel'
        },
        buttonsStyling: false,
        html: `
            <div style="text-align: left; margin-top: 14px;">
                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                    Stock Disponible (Unidades)
                </label>
                <input type="number" id="editStockInput" class="croiss-swal-input" value="${stockActual}" min="0">

                <label style="display:block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
                    Precio de Venta ($)
                </label>
                <input type="number" id="editPrecioInput" class="croiss-swal-input" value="${precioActual}" min="0" step="0.5" style="margin-bottom: 0 !important;">
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Guardar Cambios',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        preConfirm: () => {
            const nuevoStock = document.getElementById('editStockInput').value;
            const nuevoPrecio = document.getElementById('editPrecioInput').value;

            if (nuevoStock === '' || nuevoStock < 0) {
                Swal.showValidationMessage('Ingresá un stock válido');
                return false;
            }
            return { stock: parseInt(nuevoStock), precio: parseFloat(nuevoPrecio) || 0 };
        }
    }).then(async (result) => {
        if (result.isConfirmed) {
            mostrarLoaderSutil('Actualizando producto...');

            try {
                const res = await fetch('/api/stock/actualizar', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        producto: prodNombre,
                        stock: result.value.stock,
                        precio: result.value.precio
                    })
                });
                const data = await res.json();
                Swal.close();

                if (data.status === 'exito') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Stock Actualizado!',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    cargarStock();
                } else {
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                Swal.close();
                console.error("Error al actualizar stock:", err);
                Swal.fire('Error', 'No se pudo actualizar el stock', 'error');
            }
        }
    });
}

// Cargar Agenda
async function cargarAgenda() {
    const contenedor = document.getElementById('listaAgenda');
    if(!contenedor) return;
    contenedor.innerHTML = '<p style="text-align:center; color:#64748b;">Cargando compromisos...</p>';

    try {
        const res = await fetch('/api/agenda');
        const data = await res.json();

        if(data.status === 'exito') {
            contenedor.innerHTML = '';

            data.agenda.forEach(dia => {
                const total = dia.total_croissants;
                const limite = 35;
                const porcentaje = Math.min(100, Math.round((total / limite) * 100));

                let claseBadge = 'badge-ok';
                if (total >= 35) claseBadge = 'badge-full';
                else if (total >= 25) claseBadge = 'badge-warning';

                let htmlPedidos = '';
                if(dia.pedidos.length === 0) {
                    htmlPedidos = '<p style="font-size:0.85rem; color:#94a3b8; font-style:italic;">Sin pedidos para este día.</p>';
                } else {
                    dia.pedidos.forEach(p => {
                        const btnMaps = p.direccion ? `
                            <button type="button" class="btn-jalea-chip" style="font-size:0.7rem; padding: 2px 8px; margin-left:6px;" onclick="abrirGoogleMaps('${p.direccion}')">📍 Maps</button>
                        ` : '';

                        htmlPedidos += `
                            <div class="agenda-pedido-item">
                                <div>
                                    <strong>👤 ${p.cliente}</strong> <small style="color:#64748b;">(${p.estado})</small>${btnMaps}<br>
                                    <span style="font-size:0.85rem; color:#334155;">📦 ${p.descripcion}</span>
                                </div>
                                <span style="font-weight:700; color:#d97706;">${p.cantidad} un.</span>
                            </div>
                        `;
                    });
                }

                const card = document.createElement('div');
                card.className = 'card agenda-card';
                card.style.boxShadow = 'none';
                card.style.border = '1px solid var(--border-color)';
                card.innerHTML = `
                    <div class="agenda-header">
                        <span class="agenda-titulo">${dia.nombre_dia}</span>
                        <span class="agenda-badge ${claseBadge}">${total} / 35 croiss</span>
                    </div>
                    <div class="progress-bar-bg">
                        <div class="progress-bar-fill ${claseBadge}" style="width: ${porcentaje}%"></div>
                    </div>
                    <div style="margin-top: 12px;">${htmlPedidos}</div>
                `;
                contenedor.appendChild(card);
            });
        }
    } catch (err) {
        contenedor.innerHTML = '<p style="color:red; text-align:center;">Error al cargar la agenda.</p>';
    }
}

// Cargar Cuentas
async function cargarCuentas() {
    mostrarLoaderSutil('Consultando entregas...');
    const contPago = document.getElementById('listaPendientesPago');
    const contEntrega = document.getElementById('listaPendientesEntrega');
    const bannerTotal = document.getElementById('cMontoPendienteTotal');

    try {
        const res = await fetch('/api/cuentas');
        const data = await res.json();
        Swal.close();

        if (data.status === 'exito') {
            if(bannerTotal) bannerTotal.innerText = `$${data.total_por_cobrar}`;

            if(contPago) {
                contPago.innerHTML = '';
                if (data.pendientes_pago.length === 0) {
                    contPago.innerHTML = '<p style="font-size:0.85rem; color:#16a34a; font-weight:600;">¡Excelente! Nadie te debe dinero.</p>';
                } else {
                    data.pendientes_pago.forEach(p => {
                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>👤 ${p.cliente}</strong> <small style="color:#64748b;">(Entrega: ${p.fecha_entrega})</small><br>
                                <span style="font-size:0.85rem; color:#475569;">📦 ${p.producto} (${p.cantidad} un.)</span><br>
                                <span style="font-size:0.9rem; font-weight:800; color:#dc2626;">Monto: $${p.monto}</span>
                            </div>
                            <button class="btn-pagar-ahora" onclick="marcarComoPagado(${p.fila}, '${p.cliente}')">✓ Marcar Pagado</button>
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
                        const badgeTexto = esPagado ? 'Pagado 🟢' : 'Debe 🔴';

                        const btnMaps = e.direccion ? `
                            <button type="button" class="btn-jalea-chip" style="padding: 4px 8px; font-size: 0.72rem; margin-top:0;" onclick="abrirGoogleMaps('${e.direccion}')">📍 Ver Mapa</button>
                        ` : '';

                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>📅 ${e.fecha_entrega} — 👤 ${e.cliente}</strong><br>
                                <span style="font-size:0.85rem; color:#334155;">📦 ${e.producto} (${e.cantidad} un.)</span>
                                ${e.direccion ? `<br><small style="color:#64748b;">📍 ${e.direccion}</small>` : ''}
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:6px;">
                                <span class="agenda-badge ${badgeClase}">${badgeTexto}</span>
                                ${btnMaps}
                                <button class="btn-jalea-chip active" style="padding: 6px 10px; font-size: 0.75rem;" onclick="notificarEntrega(${e.fila}, '${e.cliente}')">🚚 Entregado</button>
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

async function notificarEntrega(numFila, nombreCliente) {
    Swal.fire({
        title: '¿Confirmar entrega?',
        text: `Se marcará como entregado y se enviará el mail de agradecimiento a ${nombreCliente}`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#C86D28',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, entregar y notificar por mail'
    }).then(async (result) => {
        if (result.isConfirmed) {
            mostrarLoaderSutil('Registrando entrega...');
            try {
                const res = await fetch('/api/marcar_entregado', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila })
                });
                const data = await res.json();
                Swal.close();

                if (data.status === 'exito') {
                    Swal.fire({
                        icon: 'success',
                        title: '¡Pedido Entregado!',
                        text: 'Se actualizó el estado y se envió el correo de confirmación.',
                        timer: 1800,
                        showConfirmButton: false
                    });
                    cargarCuentas();
                } else {
                    Swal.fire('Atención', data.mensaje, 'warning');
                }
            } catch (err) {
                Swal.close();
                console.error("Error al notificar entrega:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

async function marcarComoPagado(numFila, nombreCliente) {
    Swal.fire({
        title: '¿Confirmar cobro?',
        text: `Se marcará el pedido de ${nombreCliente} como PAGADO`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#16a34a',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'Sí, cobrado'
    }).then(async (result) => {
        if (result.isConfirmed) {
            mostrarLoaderSutil('Actualizando en Google Sheets...');
            
            try {
                const res = await fetch('/api/cambiar_estado_pago', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ fila: numFila, estado: 'Pagado' })
                });
                const data = await res.json();

                if (data.status === 'exito') {
                    await new Promise(r => setTimeout(r, 600));
                    
                    Swal.fire({
                        icon: 'success',
                        title: '¡Cobro registrado!',
                        timer: 1500,
                        showConfirmButton: false
                    });
                    cargarCuentas();
                } else {
                    Swal.close();
                    Swal.fire('Error', data.mensaje, 'error');
                }
            } catch (err) {
                Swal.close();
                console.error("Error en la petición:", err);
                Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
            }
        }
    });
}

// Cargar Balance
async function cargarBalance() {
    try {
        mostrarLoaderSutil('Actualizando balance...');

        const mesVal = document.getElementById('bMesFilter').value;
        let url = '/api/balance';
        if (mesVal) url += `?mes=${mesVal}`;

        const res = await fetch(url);
        const data = await res.json();
        Swal.close();

        if(data.status === 'exito') {
            document.getElementById('bIngresos').innerText = `$${data.ingresos}`;
            document.getElementById('bCostos').innerText = `$${data.costos_produccion}`;
            document.getElementById('bGastos').innerText = `$${data.gastos_varios}`;
            document.getElementById('bTicketPromedio').innerText = `$${data.ticket_promedio}`;

            const gananciaEl = document.getElementById('bGanancia');
            gananciaEl.innerText = `$${data.ganancia_neta}`;
            
            if(data.ganancia_neta < 0) {
                gananciaEl.style.color = "#ef4444";
            } else {
                gananciaEl.style.color = "#16a34a";
            }

            const contEvolucion = document.getElementById('listaEvolucionMeses');
            if (contEvolucion) {
                contEvolucion.innerHTML = '';
                if (data.historico_meses.length === 0) {
                    contEvolucion.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay registros históricos.</p>';
                } else {
                    data.historico_meses.forEach(m => {
                        const esPositivo = m.ganancia_neta >= 0;
                        const colorGanancia = esPositivo ? '#16a34a' : '#dc2626';
                        const badgeIcon = esPositivo ? '🟢' : '🔴';

                        const div = document.createElement('div');
                        div.className = 'ios-cliente-row compact';
                        div.style.cursor = 'default';
                        div.innerHTML = `
                            <div>
                                <strong>📅 ${m.mes_key}</strong> <small style="color:var(--text-muted);">(${m.pedidos} pedidos)</small><br>
                                <small style="color:#64748b;">Ingresos: $${m.ingresos} | Egresos: $${m.gastos_totales}</small>
                            </div>
                            <div style="text-align:right;">
                                <strong style="color:${colorGanancia}; font-size:0.95rem;">${badgeIcon} $${m.ganancia_neta}</strong><br>
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

function cambiarSegmentoBalance(segmento) {
    document.getElementById('segBtnBalance').classList.toggle('active', segmento === 'balance');
    document.getElementById('segBtnEvolucion').classList.toggle('active', segmento === 'evolucion');
    
    document.getElementById('subSecBalance').classList.toggle('active', segmento === 'balance');
    document.getElementById('subSecEvolucion').classList.toggle('active', segmento === 'evolucion');

    if (segmento === 'balance' || segmento === 'evolucion') cargarBalance();
}

// Cargar Inventario Unificado
async function cargarInsumosYGastos() {
    mostrarLoaderSutil('Cargando inventario...');
    cargarStock();

    try {
        const res = await fetch('/api/gastos_e_insumos');
        const data = await res.json();
        Swal.close();

        if (data.status === 'exito') {
            const contInsumos = document.getElementById('listaInsumosStock');
            if (contInsumos) {
                contInsumos.innerHTML = '';
                if (data.insumos.length === 0) {
                    contInsumos.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">No hay insumos registrados aún.</p>';
                } else {
                    data.insumos.forEach(ins => {
                        const vencFecha = ins['Vencimiento Proximo'] || ins['Vencimiento Próximo'] || 'Sin fecha';
                        const div = document.createElement('div');
                        div.className = 'ios-cliente-row compact';
                        div.innerHTML = `
                            <div>
                                <strong>📦 ${ins.Insumo}</strong><br>
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
                        const desc = g.Descripción || g.Descripcion || g.descripcion || 'Gasto';
                        const cat = g.Categoría || g.Categoria || g.categoria || 'Otros';
                        const fecha = g.Fecha || g.fecha || '';
                        const monto = g.Monto || g.monto || 0;
                        const cant = g.Cantidad || g.cantidad || 1;
                        const unidad = g.Unidad || g.unidad || '';

                        const div = document.createElement('div');
                        div.className = 'cuenta-item';
                        div.innerHTML = `
                            <div>
                                <strong>📅 ${fecha} — ${desc}</strong> <small style="color:#64748b;">(${cat})</small><br>
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

// Cargar Clientes
async function cargarClientes() {
    mostrarLoaderSutil('Cargando clientes...');

    try {
        const mesVal = document.getElementById('cMesFilter').value || hoy.substring(0, 7);
        const res = await fetch(`/api/clientes?mes=${mesVal}`);
        const data = await res.json();
        Swal.close();

        if (data.status === 'exito') {
            datosClientesGlobal.todos = data.clientes_todos;
            datosClientesGlobal.ranking = data.ranking_mes;

            renderizarListaDirectorio(datosClientesGlobal.todos);

            const bannerNombre = document.getElementById('topNombre');
            const bannerDetalle = document.getElementById('topDetalle');
            if (data.top_cliente_mes) {
                bannerNombre.innerText = data.top_cliente_mes.nombre;
                bannerDetalle.innerText = `Lidera con $${data.top_cliente_mes.total_gastado} gastados (${data.top_cliente_mes.total_croissants} croissants)`;
            } else {
                bannerNombre.innerText = 'Sin Compradores';
                bannerDetalle.innerText = 'Aún no se registraron ventas en este mes.';
            }

            const contRanking = document.getElementById('listaClientesRanking');
            contRanking.innerHTML = '';
            if (data.ranking_mes.length === 0) {
                contRanking.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center;">Sin ventas en el período seleccionado.</p>';
            } else {
                data.ranking_mes.forEach((c, idx) => {
                    const div = document.createElement('div');
                    div.className = 'ios-cliente-row compact';
                    div.onclick = () => verDetalleCliente(c);
                    div.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span class="cliente-rank-pos">#${idx + 1}</span>
                            <div>
                                <strong>👤 ${c.nombre}</strong><br>
                                <small style="color:var(--text-muted);">${c.total_croissants} croissants comprados</small>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px;">
                            <strong style="color:var(--accent); font-size:0.9rem;">$${c.total_gastado}</strong>
                            <span style="color:#CBD5E1; font-weight:bold; font-size:1rem;">›</span>
                        </div>
                    `;
                    contRanking.appendChild(div);
                });
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
    
    if (labelCant) labelCant.innerText = `Directorio General (${lista.length} clientes)`;
    if(!contDirectorio) return;

    contDirectorio.innerHTML = '';

    if (lista.length === 0) {
        contDirectorio.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:20px 0;">No se encontraron clientes.</p>';
        return;
    }

    lista.forEach(c => {
        const div = document.createElement('div');
        div.className = 'ios-cliente-row compact';
        div.onclick = () => verDetalleCliente(c);
        div.innerHTML = `
            <div>
                <strong>👤 ${c.nombre}</strong><br>
                <small style="color:var(--text-muted);">${c.total_pedidos} pedido(s) — ${c.total_croissants} croiss.</small>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <strong style="color:var(--text-main); font-size:0.9rem;">$${c.total_gastado}</strong>
                <span style="color:#CBD5E1; font-weight:bold; font-size:1rem;">›</span>
            </div>
        `;
        contDirectorio.appendChild(div);
    });
}

function filtrarDirectorioClientes() {
    const textoBuscado = document.getElementById('inputBuscarCliente').value.toLowerCase().trim();
    const listaFiltrada = datosClientesGlobal.todos.filter(c => 
        c.nombre.toLowerCase().includes(textoBuscado)
    );
    renderizarListaDirectorio(listaFiltrada);
}

function verDetalleCliente(clienteObj) {
    document.querySelectorAll('#sec-clientes .sub-seccion').forEach(s => s.classList.remove('active'));
    document.getElementById('subSecDetalle').classList.add('active');

    document.getElementById('detClienteNombre').innerText = clienteObj.nombre;
    document.getElementById('detClienteStats').innerText = `Histórico: $${clienteObj.total_gastado} gastados en ${clienteObj.total_croissants} croissants (${clienteObj.total_pedidos} pedidos)`;

    const contContacto = document.getElementById('detClienteContacto');
    if (contContacto) {
        let datosStr = [];
        if (clienteObj.telefono) datosStr.push(`📞 ${clienteObj.telefono}`);
        if (clienteObj.email) datosStr.push(`✉️ ${clienteObj.email}`);
        
        let mapsBtn = clienteObj.direccion ? `
            <br><span style="color:var(--text-main); font-weight:600;">📍 ${clienteObj.direccion}</span>
            <button type="button" class="btn-jalea-chip" style="margin-left:6px; font-size:0.7rem; padding: 2px 8px;" onclick="abrirGoogleMaps('${clienteObj.direccion}')">🗺️ Abrir Maps</button>
        ` : '';

        contContacto.innerHTML = (datosStr.join(' | ') || 'Sin datos de contacto') + mapsBtn;
    }

    const contHist = document.getElementById('detClienteHistorial');
    contHist.innerHTML = '';

    clienteObj.historial.forEach(h => {
        const div = document.createElement('div');
        div.className = 'historial-compra-card';
        div.innerHTML = `
            <div>
                <strong>📅 ${h.fecha}</strong> <small style="color:#64748b;">(${h.estado})</small><br>
                <span style="font-size:0.85rem; color:#334155;">📦 ${h.producto}</span>
            </div>
            <div style="text-align:right;">
                <strong style="color:var(--text-main);">$${h.monto}</strong><br>
                <small style="color:var(--accent);">${h.cantidad} un.</small>
            </div>
        `;
        contHist.appendChild(div);
    });
}

function volverASeccionAnterior() {
    cambiarSegmentoCliente(datosClientesGlobal.subOrigen || 'lista');
}

function mostrarLoaderSutil(mensaje = 'Actualizando...') {
    Swal.fire({
        title: mensaje,
        toast: true,
        position: 'top',
        showConfirmButton: false,
        background: '#FAF0EB',
        color: '#0F172A',
        customClass: { popup: 'croiss-toast-loader' },
        didOpen: () => { Swal.showLoading(); }
    });
}

// Reglas de negocio para ticket
function obtenerExtraRelleno(nombreProducto) {
    const nombre = nombreProducto.toLowerCase();
    if (nombre.includes('jamon') || nombre.includes('jamón')) return 50;
    if (nombre.includes('dulce de leche') || nombre.includes('ddl')) return 30;
    return 0;
}

function calcularPrecioBase(totalCroissants) {
    if (totalCroissants >= 6) return 100;
    if (totalCroissants >= 3) return 110;
    return 140;
}

// Agregar producto al ticket de compra
function agregarAlPedido() {
    const selectEl = document.getElementById('vProductoSelect');
    const prodNombre = selectEl ? selectEl.value.trim() : '';
    const cantInput = document.getElementById('vCantidadItem');
    const cant = cantInput ? (parseInt(cantInput.value) || 1) : 1;

    if (!prodNombre || prodNombre === 'Seleccionar croissant...') {
        Swal.fire('Atención', 'Seleccioná un croissant del menú desplegable primero.', 'warning');
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
        listEl.innerHTML = '<p style="color: #94a3b8; text-align: center;">El ticket está vacío</p>';
        totalEl.innerText = '0';
        return;
    }

    const totalCroissants = carrito.reduce((sum, item) => sum + item.cantidad, 0);
    const precioBase = calcularPrecioBase(totalCroissants);

    listEl.innerHTML = '';
    let totalGeneral = 0;

    carrito.forEach((item, index) => {
        const extraRelleno = obtenerExtraRelleno(item.producto);
        const precioUnitario = precioBase + extraRelleno;
        const subtotal = precioUnitario * item.cantidad;
        
        item.precio_unitario = precioUnitario;
        item.subtotal = subtotal;

        totalGeneral += subtotal;

        const claseJalea = item.con_jalea ? 'active' : '';
        const textoJalea = item.con_jalea ? '🍯 Con Jalea' : '+ 🍯 Jalea';

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
                <button type="button" class="btn-remove" onclick="eliminarDelCarrito(${index})">✕</button>
            </div>
        `;
        listEl.appendChild(div);
    });

    totalEl.innerText = totalGeneral;
}

// LISTENER DE REGISTRO DE PEDIDOS (Limpio y directo)
const formFinalizarPedido = document.getElementById('formFinalizarPedido');
if (formFinalizarPedido) {
    formFinalizarPedido.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (typeof carrito === 'undefined' || carrito.length === 0) {
            Swal.fire('Carrito vacío', 'Agregá al menos un producto al pedido.', 'warning');
            return;
        }

        Swal.fire({
            title: 'Guardando Pedido...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

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

            if (data.status === 'exito') {
                carrito = [];
                renderizarCarrito();
                formFinalizarPedido.reset();
                if(document.getElementById('vFecha')) document.getElementById('vFecha').value = hoy;
                if(document.getElementById('vFechaEntrega')) document.getElementById('vFechaEntrega').value = hoy;

                Swal.fire({
                    icon: 'success',
                    title: '¡Pedido Registrado! 🥐',
                    text: emailCliente ? 'Se envió el correo de confirmación al cliente.' : 'El pedido se guardó correctamente.',
                    timer: 2000,
                    showConfirmButton: false
                });

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

        Swal.fire({
            title: 'Guardando Compra...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

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

            if (data.status === 'exito') {
                Swal.fire({
                    icon: 'success',
                    title: '¡Compra / Gasto Registrado!',
                    timer: 1800,
                    showConfirmButton: false
                });
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

// Inicialización
cargarStock();
toggleCamposMateriaPrima();