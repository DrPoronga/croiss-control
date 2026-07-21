// Configuración de fechas
const hoy = new Date().toISOString().split('T')[0];
document.getElementById('vFecha').value = hoy;
document.getElementById('vFechaEntrega').value = hoy;
document.getElementById('gFecha').value = hoy;

// Inicializar el filtro de mes del balance con el mes actual (YYYY-MM)
document.getElementById('bMesFilter').value = hoy.substring(0, 7);

let catalogoProductos = [];
let carrito = [];

// Cambiar de solapa con comportamiento Toggle (Cerrar si vuelve a tocar el mismo botón)
function cambiarTab(e, tab) {
    const btnTarget = e.currentTarget;
    const yaEstaActivo = btnTarget.classList.contains('active');

    // Desactivar todos los botones y ocultar todas las secciones
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));

    if (yaEstaActivo) {
        document.getElementById('sec-home').classList.add('active');
    } else {
        btnTarget.classList.add('active');
        document.getElementById('sec-' + tab).classList.add('active');

        if(tab === 'stock') cargarStock();
        if(tab === 'agenda') cargarAgenda();
        if(tab === 'cuentas') cargarCuentas();
        if(tab === 'balance') cargarBalance();
    }
}

// Cargar Cuentas
async function cargarCuentas() {
    mostrarLoaderSutil('Consultando cuentas...');
    const contPago = document.getElementById('listaPendientesPago');
    const contEntrega = document.getElementById('listaPendientesEntrega');
    const bannerTotal = document.getElementById('cMontoPendienteTotal');

    try {
        const res = await fetch('/api/cuentas');
        const data = await res.json();
        Swal.close();

        if (data.status === 'exito') {
            bannerTotal.innerText = `$${data.total_por_cobrar}`;

            // 1. Quién me debe dinero
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

            // 2. A quién le debo pedidos
            contEntrega.innerHTML = '';
            if (data.pendientes_entrega.length === 0) {
                contEntrega.innerHTML = '<p style="font-size:0.85rem; color:#64748b; font-style:italic;">No hay pedidos programados para entregar pronto.</p>';
            } else {
                data.pendientes_entrega.forEach(e => {
                    const esPagado = e.estado.toLowerCase() === 'pagado';
                    const badgeClase = esPagado ? 'badge-ok' : 'badge-full';
                    const badgeTexto = esPagado ? 'Pagado 🟢' : 'Debe 🔴';

                    const div = document.createElement('div');
                    div.className = 'cuenta-item';
                    div.innerHTML = `
                        <div>
                            <strong>📅 ${e.fecha_entrega} — 👤 ${e.cliente}</strong><br>
                            <span style="font-size:0.85rem; color:#334155;">📦 ${e.producto} (${e.cantidad} un.)</span>
                        </div>
                        <span class="agenda-badge ${badgeClase}">${badgeTexto}</span>
                    `;
                    contEntrega.appendChild(div);
                });
            }
        }
    } catch (err) {
        Swal.close();
        console.error("Error al cargar cuentas:", err);
    }
}

// Marcar como pagado por número de fila
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

// Cargar stock desde Google Sheets
async function cargarStock() {
    try {
        const res = await fetch('/api/stock');
        const data = await res.json();
        
        if(data.status === 'exito') {
            catalogoProductos = data.productos;
            const select = document.getElementById('vProductoSelect');
            const lista = document.getElementById('listaStock');
            
            select.innerHTML = '<option value="">Seleccionar croissant...</option>';
            lista.innerHTML = '';

            catalogoProductos.forEach(prod => {
                const opt = document.createElement('option');
                opt.value = prod.Nombre;
                opt.innerText = `${prod.Nombre}`;
                select.appendChild(opt);

                const div = document.createElement('div');
                div.className = 'stock-item';
                div.innerHTML = `
                    <div>
                        <strong>${prod.Nombre}</strong><br>
                        <small style="color:var(--text-muted);">$${prod['Precio Venta'] || 'S/D'}</small>
                    </div>
                    <span class="stock-cant">${prod['Stock Actual']} un.</span>
                `;
                lista.appendChild(div);
            });
        }
    } catch (err) {
        console.error("Error al cargar stock:", err);
    }
}

async function cargarAgenda() {
    const contenedor = document.getElementById('listaAgenda');
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
                        htmlPedidos += `
                            <div class="agenda-pedido-item">
                                <div>
                                    <strong>👤 ${p.cliente}</strong> <small style="color:#64748b;">(${p.estado})</small><br>
                                    <span style="font-size:0.85rem; color:#334155;">📦 ${p.descripcion}</span>
                                </div>
                                <span style="font-weight:700; color:#d97706;">${p.cantidad} un.</span>
                            </div>
                        `;
                    });
                }

                const card = document.createElement('div');
                card.className = 'card agenda-card';
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

// Función auxiliar para loaders discretos
function mostrarLoaderSutil(mensaje = 'Actualizando...') {
    Swal.fire({
        title: mensaje,
        toast: true,
        position: 'top',
        showConfirmButton: false,
        backdrop: false,
        background: '#FAF0EB',
        color: '#0F172A',
        customClass: {
            popup: 'croiss-toast-loader'
        },
        didOpen: () => {
            Swal.showLoading();
        }
    });
}

// Cargar Balance con el nuevo indicador sutil
async function cargarBalance() {
    try {
        mostrarLoaderSutil('Actualizando balance...');

        const mesVal = document.getElementById('bMesFilter').value;
        let url = '/api/balance';
        if (mesVal) {
            url += `?mes=${mesVal}`;
        }

        const res = await fetch(url);
        const data = await res.json();

        Swal.close();

        if(data.status === 'exito') {
            document.getElementById('bIngresos').innerText = `$${data.ingresos}`;
            document.getElementById('bCostos').innerText = `$${data.costos_produccion}`;
            document.getElementById('bGastos').innerText = `$${data.gastos_varios}`;
            
            const gananciaEl = document.getElementById('bGanancia');
            gananciaEl.innerText = `$${data.ganancia_neta}`;
            
            if(data.ganancia_neta < 0) {
                gananciaEl.style.color = "#ef4444";
            } else {
                gananciaEl.style.color = "#16a34a";
            }
        } else {
            Swal.fire('Error', data.mensaje, 'error');
        }
    } catch(err) {
        Swal.close();
        console.error("Error al cargar balance:", err);
        Swal.fire('Error', 'No se pudo obtener el balance', 'error');
    }
}

function verHistoricoBalance() {
    document.getElementById('bMesFilter').value = '';
    cargarBalance();
}

// REGLAS DE NEGOCIO
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

// Agregar ítem al pedido
function agregarAlPedido() {
    const prodNombre = document.getElementById('vProductoSelect').value;
    const cant = parseInt(document.getElementById('vCantidadItem').value) || 1;

    if(!prodNombre) {
        Swal.fire('Atención', 'Selecciona un producto primero', 'warning');
        return;
    }

    carrito.push({
        producto: prodNombre,
        cantidad: cant,
        con_jalea: false,
        precio_unitario: 0,
        subtotal: 0
    });

    document.getElementById('vCantidadItem').value = 1;
    renderizarCarrito();
}

// Alternar Jalea de un ítem en el ticket
function toggleJaleaItem(index) {
    carrito[index].con_jalea = !carrito[index].con_jalea;
    renderizarCarrito();
}

function eliminarDelCarrito(index) {
    carrito.splice(index, 1);
    renderizarCarrito();
}

// Renderizar ticket
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

// Confirmar pedido
document.getElementById('formFinalizarPedido').addEventListener('submit', async (e) => {
    e.preventDefault();

    if(carrito.length === 0) {
        Swal.fire('Ticket Vacío', 'Agrega al menos un croissant al pedido', 'warning');
        return;
    }

    const totalMonto = carrito.reduce((sum, i) => sum + i.subtotal, 0);

    Swal.fire({
        title: 'Confirmando Pedido...',
        text: 'Guardando en Google Sheets',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const payload = {
        fecha: document.getElementById('vFecha').value,
        fecha_entrega: document.getElementById('vFechaEntrega').value,
        cliente: document.getElementById('vCliente').value,
        items: carrito,
        monto_total: totalMonto,
        estado: document.getElementById('vEstado').value,
        medio_pago: document.getElementById('vMedio').value
    };

    const res = await fetch('/api/venta', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    const data = await res.json();

    if(data.status === 'exito') {
        Swal.fire({
            icon: 'success',
            title: '¡Pedido Registrado!',
            text: `Código: ${data.id}`,
            timer: 2000,
            showConfirmButton: false
        });
        carrito = [];
        renderizarCarrito();
        e.target.reset();
        document.getElementById('vFecha').value = hoy;
        document.getElementById('vFechaEntrega').value = hoy;
        cargarStock();
    } else {
        Swal.fire('Error', data.mensaje, 'error');
    }
});

// Registrar gasto
document.getElementById('formGasto').addEventListener('submit', async (e) => {
    e.preventDefault();

    Swal.fire({
        title: 'Guardando Gasto...',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    const payload = {
        fecha: document.getElementById('gFecha').value,
        categoria: document.getElementById('gCategoria').value,
        descripcion: document.getElementById('gDescripcion').value,
        monto: document.getElementById('gMonto').value
    };

    const res = await fetch('/api/gasto', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
    });
    const data = await res.json();

    if(data.status === 'exito') {
        Swal.fire({
            icon: 'success',
            title: '¡Gasto Registrado!',
            timer: 2000,
            showConfirmButton: false
        });
        e.target.reset();
        document.getElementById('gFecha').value = hoy;
    } else {
        Swal.fire('Error', data.mensaje, 'error');
    }
});

cargarStock();