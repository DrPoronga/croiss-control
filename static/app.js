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

// ==========================================
// HELPER DE ANIMACIÓN Y TIEMPOS (REPARADO)
// ==========================================
async function esperarAnimacionMinima(tiempoInicio, minMs = 2200) {
    const transcurrido = Date.now() - tiempoInicio;
    if (transcurrido < minMs) {
        await new Promise(resolve => setTimeout(resolve, minMs - transcurrido));
    }
}

function getInputValueSafe(id, defaultVal = '') {
    const el = document.getElementById(id);
    return el ? el.value.trim() : defaultVal;
}

// ==========================================
// AUTENTICACIÓN BIOMÉTRICA (RESPALDO MÓVIL/PC)
// ==========================================
function esDispositivoMovil() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           ('ontouchstart' in window && navigator.maxTouchPoints > 1);
}

async function inicializarFaceID() {
    const overlay = document.getElementById('lockScreenOverlay');
    if (!overlay) return;

    if (!esDispositivoMovil()) {
        overlay.style.display = 'none';
        return;
    }

    try {
        if (window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()) {
            overlay.style.display = 'flex';
        } else {
            overlay.style.display = 'none';
        }
    } catch (e) {
        overlay.style.display = 'none';
    }
}

async function autenticarConBiometria() {
    const overlay = document.getElementById('lockScreenOverlay');
    try {
        if (!window.isSecureContext || !navigator.credentials) {
            if (overlay) overlay.style.display = 'none';
            return;
        }

        const credentialId = localStorage.getItem('croiss_bio_cred_id');

        if (!credentialId) {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const credential = await navigator.credentials.create({
                publicKey: {
                    challenge: challenge,
                    rp: { name: "CROISS Control" },
                    user: { id: new Uint8Array([1, 2, 3, 4]), name: "admin@croissuy.com", displayName: "Administrador CROISS" },
                    pubKeyCredParams: [{ alg: -7, type: "public-key" }, { alg: -257, type: "public-key" }],
                    authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
                    timeout: 60000
                }
            });

            if (credential) {
                const idStr = btoa(String.fromCharCode(...new Uint8Array(credential.rawId)));
                localStorage.setItem('croiss_bio_cred_id', idStr);
                if (overlay) overlay.style.display = 'none';
            }
        } else {
            const challenge = new Uint8Array(32);
            window.crypto.getRandomValues(challenge);

            const rawId = Uint8Array.from(atob(credentialId), c => c.charCodeAt(0));

            const assertion = await navigator.credentials.get({
                publicKey: {
                    challenge: challenge,
                    allowCredentials: [{ id: rawId, type: 'public-key' }],
                    userVerification: "required",
                    timeout: 60000
                }
            });

            if (assertion && overlay) {
                overlay.style.display = 'none';
            }
        }
    } catch (err) {
        console.error("Aviso de biometría:", err);
        if (overlay) overlay.style.display = 'none';
    }
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
    if (nombre.includes('jamon') || nombre.includes('queso')) return 50;
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
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(decodeURIComponent(direccion))}`, '_blank');
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

// ==========================================
// BALANCE Y MÉTRICAS DE VENTAS
// ==========================================
async function cargarBalance() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const mesVal = document.getElementById('bMesFilter').value || hoy.substring(0, 7);
        let url = `/api/balance?mes=${mesVal}`;

        const res = await fetch(url);
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();

        if(data.status === 'exito') {
            // Guardamos correctamente en la variable que lee el gráfico principal
            datosFlujoGlobal.diario = data.flujo_diario_mes || [];
            datosFlujoGlobal.semanal = data.flujo_semanal_historico || [];
            
            // Renderizamos la gráfica gigante
            renderizarGraficoFlujoPrincipal();

            const elCroissMes = document.getElementById('bTotalCroissMes');
            const elCroissHist = document.getElementById('bTotalCroissHist');
            if (elCroissMes) elCroissMes.innerText = `${data.total_croissants_mes} un.`;
            if (elCroissHist) elCroissHist.innerText = `${data.total_croissants_historico} un.`;

            document.getElementById('bIngresos').innerText = `$${data.ingresos}`;
            document.getElementById('bCostos').innerText = `$${data.costos_produccion}`;
            document.getElementById('bGastos').innerText = `$${data.gastos_varios}`;
            document.getElementById('bTicketPromedio').innerText = `$${data.ticket_promedio}`;

            const gananciaEl = document.getElementById('bGanancia');
            gananciaEl.innerText = `$${data.ganancia_neta}`;
            gananciaEl.style.color = data.ganancia_neta < 0 ? "#ef4444" : "#16a34a";

            renderizarGraficoGastosCategoria(data.gastos_por_categoria);

            const proy = data.proyeccion;
            const txtCroiss = document.getElementById('txtProyeccionCroiss');
            const txtIng = document.getElementById('txtProyeccionIngresos');

            if (proy && proy.es_mes_actual) {
                txtCroiss.innerText = `~${proy.croissants_estimados} Croissants`;
                txtIng.innerText = `Ingresos estimados: $${proy.ingresos_estimados} al cierre del mes`;
            } else {
                txtCroiss.innerText = `${data.total_croissants_mes} Croissants Vendidos`;
                txtIng.innerText = `Total final del período cerrado`;
            }

            const contTop = document.getElementById('boxTopClientesBalance');
            if (contTop && data.top_clientes) {
                const topM = data.top_clientes.mes;
                const topH = data.top_clientes.historico;

                contTop.innerHTML = `
                    <div style="display:flex; gap:10px; margin-bottom:16px;">
                        <div style="flex:1; background:#FAF0EB; border:1px solid #F7DFC8; border-radius:14px; padding:12px;">
                            <small style="color:var(--accent); font-weight:800; text-transform:uppercase; font-size:0.68rem;">👑 LÍDER DEL MES</small>
                            <div style="font-weight:800; font-size:0.95rem; color:#2D1E18; margin-top:2px;">${topM ? topM.nombre : 'Sin ventas'}</div>
                            <small style="color:#64748b;">${topM ? topM.croissants : 0} croiss. ($${topM ? topM.gastado : 0})</small>
                        </div>
                        <div style="flex:1; background:#F0FDF4; border:1px solid #DCFCE7; border-radius:14px; padding:12px;">
                            <small style="color:#16A34A; font-weight:800; text-transform:uppercase; font-size:0.68rem;">🏆 LÍDER HISTÓRICO</small>
                            <div style="font-weight:800; font-size:0.95rem; color:#2D1E18; margin-top:2px;">${topH ? topH.nombre : 'Sin ventas'}</div>
                            <small style="color:#16A34A; font-weight:700;">${topH ? topH.croissants : 0} croiss. ($${topH ? topH.gastado : 0})</small>
                        </div>
                    </div>
                `;
            }

            document.getElementById('txtPorcentajeJalea').innerText = `${data.stats_jalea.porcentaje}% (${data.stats_jalea.con_jalea} un.)`;

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
        cerrarCroissLoaderSeguro();
        console.error("Error al cargar balance:", err);
    }
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
    document.getElementById('segBtnBalance').classList.toggle('active', segmento === 'balance');
    document.getElementById('segBtnSabores').classList.toggle('active', segmento === 'sabores');
    document.getElementById('segBtnEvolucion').classList.toggle('active', segmento === 'evolucion');
    
    document.getElementById('subSecBalance').classList.toggle('active', segmento === 'balance');
    document.getElementById('subSecSabores').classList.toggle('active', segmento === 'sabores');
    document.getElementById('subSecEvolucion').classList.toggle('active', segmento === 'evolucion');

    cargarBalance();
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

    // Scroll suave hacia la gráfica
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

    // Gradiente sutil y elegante
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
                montosExtra: valoresMontos, // Datos adjuntos para tooltips inteligentes
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
async function cargarAgenda() {
    const contenedor = document.getElementById('listaAgenda');
    if(!contenedor) return;

    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/agenda');
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();

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
        cerrarCroissLoaderSeguro();
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
                if (name && !name.toLowerCase().includes('congelado')) {
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

function actualizarCantEdicion(idx, val) {
    if(itemsEdicionTemp[idx]) itemsEdicionTemp[idx].cantidad = Math.max(1, parseInt(val) || 1);
}

function actualizarProdEdicion(idx, val) {
    if(itemsEdicionTemp[idx]) itemsEdicionTemp[idx].producto = val.trim();
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
}

function agregarItemEdicion() {
    let primerProducto = 'Croissant Clásico';
    if (Array.isArray(catalogoProductos) && catalogoProductos.length > 0) {
        let pValid = catalogoProductos.find(p => {
            let name = obtenerNombreDesdeObjeto(p);
            return name && !name.toLowerCase().includes('congelado');
        });
        if(pValid) primerProducto = obtenerNombreDesdeObjeto(pValid);
    }
    itemsEdicionTemp.push({ cantidad: 1, producto: primerProducto, con_jalea: false });
    refrescarDomEdicion();
}

function abrirEdicionPedido(numFila) {
    if (!numFila) return;
    let pEncontrado = null;

    if (Array.isArray(agendaGlobalData)) {
        for (let dia of agendaGlobalData) {
            if (dia.pedidos) {
                let p = dia.pedidos.find(item => item.fila === numFila);
                if (p) { pEncontrado = p; break; }
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
                <label style="font-size:0.75rem; font-weight:700; color:var(--text-muted); display:block; margin-bottom:4px;">NOTAS / COMENTARIOS DEL PEDIDO</label>
                <input type="text" id="editNotasInput" value="${pEncontrado.notas || ''}" placeholder="Ej: Separar salados, entregar con moño rojo..." class="croiss-swal-input" style="margin:0 !important;">
            </div>
        `,
        showCancelButton: true, confirmButtonText: 'Guardar Cambios', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' },
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

            return { 
                fila: numFila, 
                producto: resumen.join(', '), 
                cantidad: totalCant,
                notas: nuevasNotas 
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
                await esperarAnimacionMinima(tInicio, 2200);

                if(data.status === 'exito') {
                    mostrarCroissExito('Pedido Actualizado', 'Se guardaron los cambios.');
                    cargarAgenda();
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
    
    // Limpiador de emojis para evitar corrupción de texto en la fuente estándar de jsPDF
    const limpiarEmojis = (texto) => {
        if (!texto) return '';
        return texto.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
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
async function cargarCuentas() {
    const contPago = document.getElementById('listaPendientesPago');
    const contEntrega = document.getElementById('listaPendientesEntrega');
    const bannerTotal = document.getElementById('cMontoPendienteTotal');

    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/cuentas');
        const data = await res.json();
        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();

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
                        const btnMaps = e.direccion ? `<button type="button" class="btn-jalea-chip" style="padding: 4px 8px; font-size: 0.72rem; margin-top:0;" onclick="abrirGoogleMaps('${encodeURIComponent(e.direccion)}')">Ver Mapa</button>` : '';

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
        cerrarCroissLoaderSeguro();
        console.error("Error al cargar entregas:", err);
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
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cobro Registrado!', `El pedido de ${nombreCliente} ya figura al día.`);
                    cargarCuentas();
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
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Pedido Entregado!', `Notificación enviada a ${nombreCliente}.`);
                    if (typeof cargarCuentas === 'function') cargarCuentas();
                    if (typeof cargarAgenda === 'function') cargarAgenda();
                    if (typeof cargarClientes === 'function') cargarClientes();
                } else { Swal.fire('Atención', data.mensaje, 'warning'); }
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
            await esperarAnimacionMinima(tInicio, 2200);

            if (data.status === 'exito') {
                mostrarCroissExito(
                    enviarMail ? 'Pedido Cancelado' : 'Orden Eliminada',
                    enviarMail ? `Se envió el correo de notificación a ${clienteNombre}.` : 'Se removió la orden y devolvió el stock sin enviar mail.'
                );
                if (typeof cargarCuentas === 'function') cargarCuentas();
                if (typeof cargarAgenda === 'function') cargarAgenda();
                if (typeof cargarClientes === 'function') cargarClientes();
            } else { Swal.fire('Error', data.mensaje, 'error'); }
        } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
    });
}

// ==========================================
// CONTROL DE STOCK E INSUMOS
// ==========================================
function cambiarSegmentoStock(segmento) {
    document.getElementById('segBtnStockCongelados').classList.toggle('active', segmento === 'congelados');
    document.getElementById('segBtnStockMateriaPrima').classList.toggle('active', segmento === 'materiaprima');
    document.getElementById('segBtnStockEmpaque').classList.toggle('active', segmento === 'empaque');

    document.getElementById('subSecStockCongelados').classList.toggle('active', segmento === 'congelados');
    document.getElementById('subSecStockMateriaPrima').classList.toggle('active', segmento === 'materiaprima');
    document.getElementById('subSecStockEmpaque').classList.toggle('active', segmento === 'empaque');

    if (segmento === 'congelados') {
        cargarStockCongelados();
    } else if (segmento === 'materiaprima' || segmento === 'empaque') {
        cargarInsumosYGastos();
    }
}

async function cargarStockCongelados() {
    try {
        const resCong = await fetch('/api/stock/congelados');
        const dataCong = await resCong.json();
        if (dataCong.status === 'exito') {
            const elCong = document.getElementById('cantCroissCongelados');
            if (elCong) elCong.innerText = `${dataCong.stock} un.`;
        }
        await cargarStock(true);
    } catch (err) {
        console.error("Error al cargar congelados:", err);
    }
}

async function cargarInsumosYGastos() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const res = await fetch('/api/gastos_e_insumos');
        const data = await res.json();

        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();

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
        cerrarCroissLoaderSeguro();
        console.error("Error cargando inventario:", err);
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
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    actualizarUIStockCongelados(data);
                    mostrarCroissExito('Stock Actualizado', `Fijados: ${data.congelados} croiss + ${data.masas} masa(s) (Capacidad Total: ${data.capacidad_total} croiss).`);
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo actualizar el stock', 'error'); }
        }
    });
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
                await esperarAnimacionMinima(tInicio, 2200);

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
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

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
                await esperarAnimacionMinima(tInicio, 2200);
                cerrarCroissLoaderSeguro();

                if (data.status === 'exito') {
                    mostrarCroissExito('Stock Actualizado', data.mensaje);
                    cargarInsumosYGastos();
                } else { Swal.fire('Atención', data.mensaje, 'warning'); }
            } catch (err) { Swal.fire('Error', 'No se pudo guardar el stock', 'error'); }
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
                const res = await fetch('/api/stock/congelados', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ masas: result.value }) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    actualizarUIStockCongelados(data);
                    mostrarCroissExito('Masas Agregadas!', `Se sumaron +${result.value} masa(s) (+${result.value * 10} croissants habilitados).`);
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        }
    });
}

// ==========================================
// CLIENTES Y DIRECTORIO CRM
// ==========================================
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

function filtrarDirectorioClientes() {
    const el = document.getElementById('inputBuscarCliente');
    if (!el) return;
    const textoBuscado = el.value.toLowerCase().trim();
    const listaFiltrada = datosClientesGlobal.todos.filter(c => c.nombre && c.nombre.toLowerCase().includes(textoBuscado));
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

        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();

        if (data.status === 'exito') {
            datosClientesGlobal.todos = data.clientes_todos || [];
            datosClientesGlobal.ranking = data.ranking_mes || [];

            renderizarListaDirectorio(datosClientesGlobal.todos);

            const bannerNombre = document.getElementById('topNombre');
            const bannerDetalle = document.getElementById('topDetalle');

            if (data.top_cliente_mes) {
                if (bannerNombre) bannerNombre.innerText = data.top_cliente_mes.nombre;
                if (bannerDetalle) bannerDetalle.innerHTML = `Lidera el mes con <span class="cifra-sensible" style="font-weight:800;">${data.top_cliente_mes.total_croissants} croissants</span> comprados`;
            } else {
                if (bannerNombre) bannerNombre.innerText = 'Sin Compradores';
                if (bannerDetalle) bannerDetalle.innerText = 'Aún no se registraron ventas en este mes.';
            }

            renderizarRankingMes(data.ranking_mes);
        }
    } catch (err) {
        cerrarCroissLoaderSeguro();
        console.error("Error al cargar clientes:", err);
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
                <div><strong>${c.nombre || 'Cliente'}</strong></div>
            </div>
            <div style="display:flex; align-items:center; gap:6px;">
                <strong class="cifra-sensible" style="color:var(--accent); font-size:0.9rem; background: var(--accent-light); padding: 4px 10px; border-radius: 12px;">${c.total_croissants || 0} croiss.</strong>
                <span style="color:#CBD5E1; font-weight:bold; font-size:1rem;">></span>
            </div>
        `;
        contRanking.appendChild(div);
    });
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
        div.onclick = (e) => { e.preventDefault(); verDetalleCliente(c); };

        const idTag = c.id_cliente ? `<small style="color:var(--accent); font-weight:700; margin-right:6px;">[${c.id_cliente}]</small>` : '';

        div.innerHTML = `
            <div>
                <strong>${idTag}${c.nombre || 'Sin nombre'}</strong><br>
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

    // Nombre y Categoría (Badge)
    const elNom = document.getElementById('detClienteNombre');
    if (elNom) {
        const catBadge = clienteObj.categoria ? `<span style="font-size:0.75rem; background:#FAF0EB; color:var(--accent); border:1px solid #F7DFC8; padding:3px 10px; border-radius:12px; font-weight:800; margin-left:8px; vertical-align:middle;">${clienteObj.categoria}</span>` : '';
        elNom.innerHTML = `${clienteObj.nombre || 'Cliente'}${catBadge}`;
    }

    // Tarjetas de Métricas Clave del Cliente
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
                    <small style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; display: block;">📊 Croissants Totales</small>
                    <strong style="color: var(--accent); font-size: 0.88rem;">${clienteObj.total_croissants || 0} un. (${clienteObj.total_pedidos || 0} pedidos)</strong>
                </div>
                <div style="background: #FFFFFF; border: 1px solid var(--border-color); border-radius: 12px; padding: 10px;">
                    <small style="color: var(--text-muted); font-size: 0.68rem; font-weight: 700; text-transform: uppercase; display: block;">🗓️ Última Compra</small>
                    <strong style="color: var(--text-main); font-size: 0.88rem;">${txtUltimaCompra}</strong>
                </div>
            </div>
        `;
    }
	
    // Datos de Contacto y Botón Rápido de WhatsApp
    const contContacto = document.getElementById('detClienteContacto');
    if (contContacto) {
        let datosStr = [];
        if (clienteObj.telefono) datosStr.push(`Tel: ${clienteObj.telefono}`);
        if (clienteObj.email) datosStr.push(`Email: ${clienteObj.email}`);
        
        let dirTexto = clienteObj.direccion ? `<br><span style="color:var(--text-main); font-weight:600;">Dir: ${clienteObj.direccion}</span>` : '';
        let mapsBtn = clienteObj.direccion ? ` <button type="button" class="btn-jalea-chip" style="margin-left:6px; font-size:0.7rem; padding: 2px 8px;" onclick="abrirGoogleMaps('${encodeURIComponent(clienteObj.direccion)}')">Abrir Maps</button>` : '';

        // Botón WhatsApp con mensaje pre-armado
        let telLimpio = (clienteObj.telefono || '').replace(/\D/g, '');
        let btnWhatsApp = '';
        if (telLimpio) {
            let msgText = encodeURIComponent(`¡Hola ${clienteObj.nombre}! Te escribimos de CROISS 🥐 ¿Cómo estás?`);
            btnWhatsApp = `<a href="https://wa.me/${telLimpio}?text=${msgText}" target="_blank" class="btn-jalea-chip" style="background:#25D366; color:white; border:none; padding:6px 12px; font-size:0.78rem; text-decoration:none; font-weight:700; margin-right:6px; display:inline-block;">💬 Abrir WhatsApp</a>`;
        }

        const btnEditar = `<button type="button" class="btn-jalea-chip active" style="font-size:0.78rem; padding:6px 12px;" onclick="abrirModalEditarCliente()">✏️ Editar Datos</button>`;
        
        contContacto.innerHTML = `
            <div>${datosStr.join(' | ') || 'Sin datos de contacto'}${dirTexto}${mapsBtn}</div>
            <div style="margin-top:10px; display:flex; gap:6px;">${btnWhatsApp}${btnEditar}</div>
        `;
    }

    // Historial de Compras
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
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cliente Actualizado', 'Todos los datos se guardaron correctamente.');
                    cargarClientes();
                    volverASeccionAnterior();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo actualizar la información', 'error'); }
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
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Cliente Eliminado', `${nombreCliente} fue removido.`);
                    cargarClientes();
                    volverASeccionAnterior();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
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
        title: `¿Eliminar este gasto?`,
        html: `<p style="font-size:0.88rem; color:var(--text-muted);">Se removerá <strong style="color:var(--text-main);">${descGasto}</strong> de los gastos.</p>`,
        showCancelButton: true, confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-btn-danger', cancelButton: 'croiss-swal-cancel' }
    }).then(async (result) => {
        if (result.isConfirmed) {
            const tInicio = Date.now();
            mostrarCroissLoader();
            try {
                const res = await fetch('/api/eliminar_gasto', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ fila: numFila }) });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Gasto Eliminado', 'Se removió el registro.');
                    cargarInsumosYGastos();
                    if (typeof cargarBalance === 'function') cargarBalance();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        }
    });
}

// ==========================================
// NAVEGACIÓN Y TABS
// ==========================================
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

function cambiarSegmentoGasto(segmento) {
    document.getElementById('segBtnNuevoGasto').classList.toggle('active', segmento === 'nuevo');
    document.getElementById('segBtnHistorialGasto').classList.toggle('active', segmento === 'historial');
    document.getElementById('subSecNuevoGasto').classList.toggle('active', segmento === 'nuevo');
    document.getElementById('subSecHistorialGasto').classList.toggle('active', segmento === 'historial');

    if (segmento === 'historial') cargarInsumosYGastos();
}

// ==========================================
// CARGAR MENÚ Y STOCK
// ==========================================
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

function renderizarMenuYStock() {
    const select = document.getElementById('vProductoSelect');
    const lista = document.getElementById('listaStock');
    const seleccionPrevia = select ? select.value : '';

    if (select) select.innerHTML = '<option value="" disabled selected>Seleccionar croissant...</option>';
    if (lista) lista.innerHTML = '';

    let productosRenderizados = 0;
    catalogoProductos.forEach(prod => {
        const nombreProd = obtenerNombreDesdeObjeto(prod);
        if (!nombreProd || nombreProd.toLowerCase().includes('congelado') || nombreProd.toLowerCase().includes('sobrevendido')) return;

        productosRenderizados++;
        if (select) {
            const opt = document.createElement('option');
            opt.value = nombreProd;
            opt.innerText = nombreProd;
            select.appendChild(opt);
        }

        if (lista) {
            const precioVenta = obtenerPrecioDesdeObjeto(prod);
            const div = document.createElement('div');
            div.className = 'stock-item';
            div.style.padding = '12px';
            div.innerHTML = `<div><strong>${nombreProd}</strong><br><small style="color:var(--text-muted); font-weight:600;">$${precioVenta} c/u</small></div>`;
            lista.appendChild(div);
        }
    });

    if (lista && productosRenderizados === 0) {
        lista.innerHTML = '<p style="font-size:0.85rem; color:#94a3b8; text-align:center; padding:15px 0;">No hay productos cargados en el menú.</p>';
    }

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

        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();
    } catch (err) {
        cerrarCroissLoaderSeguro();
        console.error("Error al cargar todo el stock:", err);
    }
}

// ==========================================
// FORMULARIOS DE REGISTRO (SUBMIT LISTENERS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    inicializarFaceID();

    const formFinalizarPedido = document.getElementById('formFinalizarPedido');
    if (formFinalizarPedido) {
        formFinalizarPedido.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (typeof carrito === 'undefined' || carrito.length === 0) {
                Swal.fire('Carrito vacío', 'Agrega al menos un producto al pedido.', 'warning');
                return;
            }

            const tInicio = Date.now();
            mostrarCroissLoader();

            const payload = {
                fecha: getInputValueSafe('vFecha', hoy),
                fecha_entrega: getInputValueSafe('vFechaEntrega', hoy),
                cliente: getInputValueSafe('vCliente', 'Consumidor Final'),
                telefono: getInputValueSafe('vTelefonoCliente'),
                email: getInputValueSafe('vEmailCliente'),
                direccion: getInputValueSafe('vDireccionCliente'),
                items: carrito,
                monto_total: carrito.reduce((acc, i) => acc + (i.precio_unitario * i.cantidad), 0),
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
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    carrito = [];
                    renderizarCarrito();
                    formFinalizarPedido.reset();
                    if(document.getElementById('vFecha')) document.getElementById('vFecha').value = hoy;
                    if(document.getElementById('vFechaEntrega')) document.getElementById('vFechaEntrega').value = hoy;

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
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                await esperarAnimacionMinima(tInicio, 2200);

                if (data.status === 'exito') {
                    mostrarCroissExito('Compra / Gasto Registrado!', 'Se actualizó el historial y el stock de insumos.');
                    formGasto.reset();
                    if(document.getElementById('gFecha')) document.getElementById('gFecha').value = hoy;
                    toggleCamposMateriaPrima();
                    cargarInsumosYGastos();
                } else { Swal.fire('Error', data.mensaje, 'error'); }
            } catch (err) { Swal.fire('Error', 'No se pudo conectar con el servidor', 'error'); }
        });
    }

    // Inicialización al cargar la web
    cargarStock();
    toggleCamposMateriaPrima();
});

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

async function cargarStockCongelados() {
    try {
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

async function cargarTodoElStock() {
    const tInicio = Date.now();
    mostrarCroissLoader();

    try {
        const resCong = await fetch('/api/stock/congelados');
        const dataCong = await resCong.json();
        if (dataCong.status === 'exito') {
            actualizarUIStockCongelados(dataCong);
        }

        await cargarStock(true);
        await cargarInsumosYGastos();

        await esperarAnimacionMinima(tInicio, 2200);
        cerrarCroissLoaderSeguro();
    } catch (err) {
        cerrarCroissLoaderSeguro();
        console.error("Error al cargar todo el stock:", err);
    }
}

