const croissImagePreload = new Image();
croissImagePreload.src = '/static/croissant.png';
let croissAnimFrameId = null;

const defaultMenu = [
    { nombre: "Croissant Clásico", relleno: "ninguno" },
    { nombre: "Croissant c/ Dulce de Leche (+ $30)", relleno: "dulce" },
    { nombre: "Croiss a la Creme (Relleno de Crema Pastelera)", relleno: "dulce" },
    { nombre: "Croissant c/ Jamón y Queso (+ $50)", relleno: "salado" },
    { nombre: "Croisstzel (Tu Croissant Clásico con sal en escamas)", relleno: "ninguno" },
    { nombre: "Croisstzel c/ Dulce de Leche (+ $30)", relleno: "dulce" },
    { nombre: "Croisstzel c/ Jamón y Queso (+ $50)", relleno: "salado" }
];

let menuItems = defaultMenu;
let cart = {}; 
let selectedDate = "";
let datesCapacity = [];

// REGLAS DE DÍAS POR ZONA (0 = Domingo, 1 = Lunes, 2 = Martes, 3 = Miércoles, 4 = Jueves, 5 = Viernes, 6 = Sábado)
const REGLAS_ZONAS = {
    "zona_1": { nombre: "Malvín / P. Gorda / Carrasco / C. de la Costa", diasValidos: [1, 4, 6], nota: "Lunes, Jueves o Sábado (Mañana)" },
    "zona_2": { nombre: "Pocitos / Punta Carretas", diasValidos: [1, 4], nota: "Lunes o Jueves (Mañana)" },
    "zona_3": { nombre: "Zonamerica", diasValidos: [1, 3, 4], nota: "Lunes, Miércoles o Jueves" },
    "zona_4": { nombre: "Pinamar / El Pinar / Salinas", diasValidos: [1, 3, 4, 5, 6], nota: "Toda la semana (excepto Martes y Domingos)" },
    "zona_otra": { nombre: "Otra Zona (A coordinar)", diasValidos: [], nota: "Coordinación directa por WhatsApp" }
};

function renderDates() {
    const container = document.getElementById('datesContainer');
    const descZonaEl = document.getElementById('txtDescZonaSeleccionada');
    if (!container) return;
    container.innerHTML = '';

    const zonaSel = document.getElementById('custZonaSelect')?.value;

    if (!zonaSel || !REGLAS_ZONAS[zonaSel]) {
        if (descZonaEl) descZonaEl.innerText = "Por favor seleccioná tu zona arriba en el Paso 2 para ver las fechas permitidas.";
        container.innerHTML = `<div style="grid-column: span 2; text-align: center; color: #DC2626; font-weight: 700; padding: 20px 0;">⚠️ Volvé al Paso 2 y elegí tu Zona / Barrio.</div>`;
        return;
    }

    // CASO ESPECIAL: "OTRA ZONA"
    if (zonaSel === "zona_otra") {
        selectedDate = "A coordinar por WhatsApp";
        if (descZonaEl) descZonaEl.innerText = "Zona especial o diferente.";
        container.innerHTML = `
            <div style="grid-column: span 2; background: #FFFBEB; border: 1.5px solid #FCD34D; border-radius: 16px; padding: 18px; text-align: center;">
                <strong style="color: #B45309; font-size: 0.98rem; display: block; margin-bottom: 6px;">💬 Coordinación Especial</strong>
                <p style="font-size: 0.82rem; color: #7A6B63; margin-bottom: 12px; line-height: 1.4;">
                    Al estar en otra zona, la fecha de entrega y la viabilidad del envío las confirmamos personalmente por WhatsApp.
                </p>
                <a href="https://wa.me/59899526301?text=${encodeURIComponent('Hola CROISS! Quisiera consultar si hacen envíos a mi zona.')}" target="_blank" class="btn-jalea-chip" style="background: #25D366; color: white; border: none; padding: 10px 18px; font-weight: 800; text-decoration: none; border-radius: 20px; display: inline-block;">
                    💬 Hablar por WhatsApp Ahora
                </a>
            </div>
        `;
        return;
    }

    const reglaZona = REGLAS_ZONAS[zonaSel];
    if (descZonaEl) descZonaEl.innerText = `Días disponibles para ${reglaZona.nombre}: ${reglaZona.nota}. (Mínimo 48hs de anticipación)`;

    const calc = calculatePrices();
    const croissantsPedidos = calc.totalCroissants;

    // CÁLCULO DE FECHA LÍMITE (HOY + 48 Horas Mínimas)
    const fechaMinima48h = new Date();
    fechaMinima48h.setDate(fechaMinima48h.getDate() + 2); // Suma 2 días enteros
    fechaMinima48h.setHours(0, 0, 0, 0); // Limpia la hora para comparar solo fechas

    let hayFechasDisponibles48h = false;

    (datesCapacity || []).forEach(d => {
        // Parse de fecha local YYYY-MM-DD
        const partes = d.fecha.split('-');
        const fechaDt = new Date(partes[0], partes[1] - 1, partes[2]);
        fechaDt.setHours(0, 0, 0, 0);

        // REGLA 1: ¿Cumple las 48hs mínimas? (Es posterior o igual a Hoy + 2 Días)
        const cumple48hs = fechaDt >= fechaMinima48h;

        // REGLA 2: ¿El día de la semana está habilitado para la zona?
        const diaSemana = fechaDt.getDay();
        const esDiaPermitidoZona = reglaZona.diasValidos.includes(diaSemana);

        const div = document.createElement('div');
        const acumulado = d.ocupados || 0;
        const disponible = 35 - acumulado;

        const esLleno = acumulado >= 35;
        const esInsuficiente = !esLleno && (croissantsPedidos > disponible);
        let isSel = d.fecha === selectedDate;

        if (isSel && (!cumple48hs || !esDiaPermitidoZona || esLleno || esInsuficiente)) {
            selectedDate = "";
            isSel = false;
        }

        let statusText = "Disponible";
        let extraClass = "";

        if (!cumple48hs) {
            statusText = "Consultar por WhatsApp";
            extraClass = "disabled";
        } else if (!esDiaPermitidoZona) {
            statusText = "Sin envíos a tu zona";
            extraClass = "disabled";
        } else if (esLleno) {
            statusText = "Agotado";
            extraClass = "disabled";
        } else if (esInsuficiente) {
            statusText = `Quedan ${disponible}`;
            extraClass = "disabled";
        }

        if (cumple48hs && esDiaPermitidoZona) {
            hayFechasDisponibles48h = true;
        }

        div.className = `web-date-btn ${isSel ? 'selected' : ''} ${extraClass}`;
        div.innerHTML = `
            <div style="font-size:0.92rem; font-weight:800;">${d.nombre_dia}</div>
            <small style="font-size:0.72rem; margin-top:2px; display:block; color: ${cumple48hs && esDiaPermitidoZona ? '#7A6B63' : '#DC2626'};">${statusText}</small>
        `;

        if (cumple48hs && esDiaPermitidoZona && !esLleno && !esInsuficiente) {
            div.onclick = () => {
                selectedDate = d.fecha;
                renderDates();
                buildSummary();
            };
        }
        container.appendChild(div);
    });

    // Cartel informativo adicional si quieren pedir rápido
    const avisoUrgencia = document.createElement('div');
    avisoUrgencia.style.cssText = "grid-column: span 2; margin-top: 12px; background: #FAF9F8; border: 1px dashed #D8CFC8; border-radius: 12px; padding: 10px; text-align: center; font-size: 0.8rem; color: #7A6B63;";
    avisoUrgencia.innerHTML = `
        ¿Lo necesitás con urgencia para hoy o mañana? 🥐<br>
        <a href="https://wa.me/59899526301?text=${encodeURIComponent('Hola CROISS! Quisiera consultar si tienen disponibilidad de pedidos urgentes para hoy o mañana.')}" target="_blank" style="color: #C86D28; font-weight: 800; text-decoration: underline;">
            Consultar disponibilidad urgente por WhatsApp
        </a>
    `;
    container.appendChild(avisoUrgencia);
}

document.addEventListener('DOMContentLoaded', () => {
    fetchCatalogo();
    fetchFechas();
    iniciarObservadorScroll();
});

function iniciarObservadorScroll() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) entry.target.classList.add('visible');
            else entry.target.classList.remove('visible');
        });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

function scrollToSection(idSeccion) {
    const el = document.getElementById(idSeccion);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function verMenuPublico() {
    Swal.fire({
        html: `
            <!-- CSS para ocultar la barra de scroll en todos los navegadores -->
            <style>
                .menu-scroll-clean::-webkit-scrollbar { display: none !important; }
                .menu-scroll-clean { -ms-overflow-style: none !important; scrollbar-width: none !important; }
            </style>

            <div class="menu-scroll-clean" style="position: relative; max-height: 85vh; overflow-y: auto; padding: 10px; max-width: 480px; margin: 0 auto; -webkit-overflow-scrolling: touch;">
                <!-- Botón X Sutil y Flotante -->
                <button type="button" onclick="Swal.close()" style="position: sticky; top: 0; float: right; background: rgba(0, 0, 0, 0.55); color: #FFFFFF; border: 1px solid rgba(255, 255, 255, 0.25); width: 32px; height: 32px; border-radius: 50%; font-size: 0.9rem; font-weight: bold; cursor: pointer; backdrop-filter: blur(8px); z-index: 9999; display: flex; align-items: center; justify-content: center; margin-bottom: -32px; margin-right: 4px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">✕</button>

                <!-- Imágenes del Menú vinculadas con su ruta absoluta -->
                <img src="/static/menu.png" style="width: 100%; border-radius: 20px; margin-bottom: 12px; display: block; box-shadow: 0 15px 35px rgba(0,0,0,0.4);" alt="Menú 1">
                <img src="/static/menu2.jpg" style="width: 100%; border-radius: 20px; display: block; box-shadow: 0 15px 35px rgba(0,0,0,0.4);" alt="Menú 2">
            </div>
        `,
        background: 'transparent',
        showConfirmButton: false,
        allowOutsideClick: true,
        customClass: { popup: 'croiss-swal-popup-transparent' }
    });
}

function mostrarCroissLoader() {
    if (!croissImagePreload.src) croissImagePreload.src = '/static/croissant.png';
    Swal.fire({
        html: `<div class="croiss-canvas-container"><canvas id="croissBiteCanvas" width="180" height="140"></canvas></div>`,
        showConfirmButton: false, allowOutsideClick: false, background: 'transparent',
        customClass: { popup: 'croiss-swal-popup-transparent' },
        didOpen: () => {
            const popup = Swal.getPopup();
            if (popup) popup.setAttribute('data-is-loader', 'true');
            iniciarAnimacionCanvasCroissant();
        },
        willClose: () => { if (croissAnimFrameId) cancelAnimationFrame(croissAnimFrameId); }
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
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
        for (let i = 0; i < 5; i++) {
            const angle = (Math.PI / 3) + (i * (Math.PI / 4.2));
            const tx = cx + Math.cos(angle) * (radius - 2);
            const ty = cy + Math.sin(angle) * (radius - 2);
            ctx.beginPath(); ctx.arc(tx, ty, radius * 0.28, 0, Math.PI * 2); ctx.fill();
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
                    if (progress >= b.t && progress < b.t + 0.10) currentShake = b.shake;
                }
            }
            canvas.className = currentShake;
        }
        croissAnimFrameId = requestAnimationFrame(render);
    }
    render();
}

async function fetchCatalogo() {
    try {
        const res = await fetch('/api/public/catalogo');
        const data = await res.json();
        if(data.status === 'exito' && Array.isArray(data.productos) && data.productos.length > 0) {
            let lista = data.productos.map(p => {
                let nombreLimpio = p.nombre || '';
                if (nombreLimpio.toLowerCase().includes('sal') && !nombreLimpio.toLowerCase().includes('croisstzel')) {
                    if (nombreLimpio.toLowerCase().includes('jamon') || nombreLimpio.toLowerCase().includes('queso')) {
                        nombreLimpio = "Croisstzel c/ Jamón y Queso (+ $50)";
                    } else if (nombreLimpio.toLowerCase().includes('dulce') || nombreLimpio.toLowerCase().includes('ddl')) {
                        nombreLimpio = "Croisstzel c/ Dulce de Leche (+ $30)";
                    } else {
                        nombreLimpio = "Croisstzel (Tu Croissant Clásico con sal en escamas)";
                    }
                } else if (nombreLimpio.toLowerCase().includes('creme') || nombreLimpio.toLowerCase().includes('crema')) {
                    nombreLimpio = "Croiss a la Creme (Relleno de Crema Pastelera)";
                }
                return { ...p, nombre: nombreLimpio };
            });

            // Reordenar dinámicamente para ubicar Croiss a la Creme abajo de Dulce de Leche
            const idxCreme = lista.findIndex(p => p.nombre.toLowerCase().includes('creme') || p.nombre.toLowerCase().includes('crema'));
            if (idxCreme !== -1) {
                const itemCreme = lista.splice(idxCreme, 1)[0];
                const idxDulce = lista.findIndex(p => p.nombre.toLowerCase().includes('dulce') || p.nombre.toLowerCase().includes('ddl'));
                if (idxDulce !== -1) {
                    lista.splice(idxDulce + 1, 0, itemCreme);
                } else {
                    lista.push(itemCreme);
                }
            }

            menuItems = lista;
        }
    } catch(e) { console.error(e); }
    renderProducts();
}

async function fetchFechas() {
    try {
        const res = await fetch('/api/public/fechas');
        const data = await res.json();
        if(data.status === 'exito' && Array.isArray(data.fechas)) {
            datesCapacity = data.fechas;
        }
    } catch(e) { console.error(e); }
    renderDates();
}

function alCambiarZona() {
    selectedDate = "";
    renderDates();
    buildSummary();
}

function updateQty(name, change) {
    if(!cart[name]) cart[name] = { cantidad: 0, con_jalea: false };
    cart[name].cantidad += change;
    if(cart[name].cantidad <= 0) delete cart[name];
    renderProducts();
}

function setJaleaShop(name, conJaleaVal) {
    if (!cart[name]) cart[name] = { cantidad: 0, con_jalea: conJaleaVal };
    else cart[name].con_jalea = conJaleaVal;
    renderProducts();
}

function setSalsaShop(name, index, val) {
    if (!cart[name]) cart[name] = { cantidad: 1, con_jalea: false, salsas: [] };
    if (!cart[name].salsas) cart[name].salsas = [];
    cart[name].salsas[index] = val;
}

function renderProducts() {
    const container = document.getElementById('shopProductsList');
    if(!container) return;
    container.innerHTML = '';

    const OpcionesSalsas = ["Dulce de Leche", "Frutilla", "Jalea"];

    menuItems.forEach(p => {
        if (!p || !p.nombre) return;
        const name = p.nombre;
        const safeName = name.replace(/'/g, "\\'");
        const nameLower = name.toLowerCase();
        const qty = cart[name] ? cart[name].cantidad : 0;
        const conJalea = cart[name] ? cart[name].con_jalea : false;

        const displayName = name.replace(
            /\(([^)]+)\)/g, 
            '<span style="display: block; font-weight: 300; font-size: 0.82rem; color: #7A6B63; margin-top: 2px;">($1)</span>'
        );

        let badgeAhorro = '';
        let selectorSalsasHtml = '';

        if (nameLower.includes('pop')) {
            const numSalsas = nameLower.includes('9') ? 1 : 2;
            if (qty > 0) {
                if (!cart[name].salsas) cart[name].salsas = Array(numSalsas).fill("Dulce de Leche");
                let selectores = '';
                for (let i = 0; i < numSalsas; i++) {
                    const salsaActual = cart[name].salsas[i] || "Dulce de Leche";
                    let opcionesHtml = OpcionesSalsas.map(s => `<option value="${s}" ${s === salsaActual ? 'selected' : ''}>${s}</option>`).join('');
                    selectores += `
                        <div style="margin-top:4px;">
                            <small style="font-size:0.7rem; font-weight:700; color:#7A6B63;">Salsa ${i + 1}:</small>
                            <select onchange="setSalsaShop('${safeName}', ${i}, this.value)" style="padding:3px 8px; font-size:0.75rem; border-radius:8px; border:1px solid #D8CFC8; background:#FFFFFF;">
                                ${opcionesHtml}
                            </select>
                        </div>
                    `;
                }
                selectorSalsasHtml = `<div style="margin-top:6px; background:#FAF0EB; padding:8px; border-radius:10px; border:1px dashed #C86D28;">${selectores}</div>`;
            }
        }

        const selectorJaleaHtml = (qty > 0 && !nameLower.includes('pop')) ? `
            <div class="jalea-toggle-group">
                <button type="button" class="btn-jalea-pill ${!conJalea ? 'active' : ''}" onclick="setJaleaShop('${safeName}', false)">Sin Jalea</button>
                <button type="button" class="btn-jalea-pill ${conJalea ? 'active' : ''}" onclick="setJaleaShop('${safeName}', true)">Con Jalea</button>
            </div>
        ` : '';

        const div = document.createElement('div');
        div.className = 'menu-row';
        div.innerHTML = `
            <div class="menu-item-info">
                <strong>${displayName}</strong>
                ${badgeAhorro}
                ${selectorJaleaHtml}
                ${selectorSalsasHtml}
            </div>
            <div class="menu-qty-selector">
                <button type="button" class="btn-qty-flat" onclick="updateQty('${safeName}', -1)">-</button>
                <span class="qty-number">${qty}</span>
                <button type="button" class="btn-qty-flat" onclick="updateQty('${safeName}', 1)">+</button>
            </div>
        `;
        container.appendChild(div);
    });
    updateSubtotal();
}

function calculatePrices() {
    let totalCroissantsNormales = 0;
    for(let k in cart) {
        if(cart[k] && cart[k].cantidad && !k.toLowerCase().includes('pop')) {
            totalCroissantsNormales += cart[k].cantidad;
        }
    }

    let basePrice = 140;
    if(totalCroissantsNormales >= 6) basePrice = 100;
    else if(totalCroissantsNormales >= 3) basePrice = 110;

    let totalMoney = 0;
    let totalCroissants = 0;

    for(let k in cart) {
        if(!cart[k] || cart[k].cantidad <= 0) continue;
        let kLower = k.toLowerCase();
        totalCroissants += cart[k].cantidad;

        if (kLower.includes('pop')) {
            let prodMatch = menuItems.find(p => p.nombre && p.nombre.toLowerCase() === kLower);
            let precioFijo = prodMatch && prodMatch.precio ? prodMatch.precio : 0;
            totalMoney += precioFijo * cart[k].cantidad;
        } else {
            let extra = 0;
            // Detecta Jamón, Queso, Salado y también Creme / Crema (+ $50 extra)
            if(kLower.includes('jamon') || kLower.includes('jamón') || kLower.includes('queso') || kLower.includes('salado') || kLower.includes('creme') || kLower.includes('crema')) extra = 50;
            else if(kLower.includes('dulce') || kLower.includes('ddl')) extra = 30;

            totalMoney += (basePrice + extra) * cart[k].cantidad;
        }
    }
    return { totalCroissants, totalMoney, basePrice };
}

function updateSubtotal() {
    const calc = calculatePrices();
    const subtotalEl = document.getElementById('shopSubtotalText');
    if(subtotalEl) subtotalEl.innerText = `$${calc.totalMoney}`;

    renderDates();
    buildSummary();
}


function toggleOpcionRegalo() {
    const chk = document.getElementById('chkEsRegalo');
    const box = document.getElementById('boxRegaloCampos');
    if (box) box.style.display = (chk && chk.checked) ? 'block' : 'none';
}

function buildSummary() {
    const calc = calculatePrices();
    const box = document.getElementById('orderSummaryBox');
    if(!box) return;

    const nom = (document.getElementById('custNombre')?.value || '').trim();
    const tel = (document.getElementById('custTel')?.value || '').trim();
    const zonaVal = document.getElementById('custZonaSelect')?.value;
    const zonaNombre = REGLAS_ZONAS[zonaVal] ? REGLAS_ZONAS[zonaVal].nombre : '';
    const dir = (document.getElementById('custDir')?.value || '').trim();
    const esRegalo = document.getElementById('chkEsRegalo')?.checked;
    const destinatario = (document.getElementById('custRegaloDestinatario')?.value || '').trim();
    const mensajeRegalo = (document.getElementById('custRegaloMensaje')?.value || '').trim();

    if (calc.totalCroissants === 0) {
        box.innerHTML = `<p style="color: #94a3b8; text-align: center; margin: 0;">Agregá croissants arriba para ver el resumen</p>`;
        return;
    }

    let itemsHtml = '';
    for(let k in cart) {
        if(cart[k] && cart[k].cantidad > 0) {
            let detalleSalsas = (cart[k].salsas && cart[k].salsas.length > 0) ? ` <span style="font-size:0.8rem; color:#C86D28;">(Salsas: ${cart[k].salsas.join(', ')})</span>` : '';
            itemsHtml += `<div>• ${cart[k].cantidad}x ${k}${detalleSalsas} ${cart[k].con_jalea ? '(Con Jalea)' : ''}</div>`;
        }
    }

    let bloqueRegaloHtml = '';
    if (esRegalo) {
        bloqueRegaloHtml = `
            <div style="background:#FAF0EB; border:1px dashed #C86D28; border-radius:12px; padding:10px; margin:10px 0;">
                <strong style="color:#C86D28;">Pedido para Regalo</strong><br>
                ${destinatario ? `<strong>Para:</strong> ${destinatario}<br>` : ''}
                ${mensajeRegalo ? `<strong>Mensaje:</strong> "<em>${mensajeRegalo}</em>"` : ''}
            </div>
        `;
    }

    let clienteHtml = nom ? '<strong>Cliente:</strong> ' + nom + '<br>' : '';
    let contactoHtml = tel ? '<strong>Contacto:</strong> ' + tel + '<br>' : '';
    let zonaHtml = zonaNombre ? '<strong>Zona:</strong> ' + zonaNombre + '<br>' : '';
    let fechaHtml = selectedDate ? selectedDate : '<span style="color:#DC2626;">(Seleccionar arriba)</span>';

    box.innerHTML = `
        <div style="margin-bottom: 8px;">
            ${clienteHtml}
            ${contactoHtml}
            ${zonaHtml}
            <strong>Fecha Entrega:</strong> ${fechaHtml}<br>
        </div>
        ${bloqueRegaloHtml}
        <div style="margin-top: 8px;">
            <strong style="color:#C86D28;">Items:</strong>
            ${itemsHtml}
        </div>
        <div style="margin-top:12px; font-size:1.2rem; font-weight:800; text-align:right; color:#2D1E18;">
            Total A Pagar: $${calc.totalMoney}
        </div>
    `;
}

function mostrarAlertaCliente(titulo, texto, icono = 'warning') {
    Swal.fire({
        title: titulo, text: texto, icon: icono, confirmButtonText: 'Entendido',
        customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' }
    });
}

function irAlPaso(paso) {
    const calc = calculatePrices();

    // Validar Paso 1 (Menú)
    if (paso > 1 && calc.totalCroissants === 0) {
        mostrarAlertaCliente('Elegí tus croissants', 'Agregá al menos 1 croissant a tu pedido antes de continuar.');
        return;
    }

    // Validar Paso 2 (Datos del cliente y Zona)
    if (paso > 2) {
        const nom = (document.getElementById('custNombre')?.value || '').trim();
        const tel = (document.getElementById('custTel')?.value || '').trim();
        const email = (document.getElementById('custEmail')?.value || '').trim();
        const zona = (document.getElementById('custZonaSelect')?.value || '').trim();
        const dir = (document.getElementById('custDir')?.value || '').trim();

        if (!nom || !tel || !email || !zona || !dir) {
            mostrarAlertaCliente('Campos Obligatorios', 'Por favor completa Nombre, Teléfono, Email, Zona y Dirección antes de elegir la fecha.');
            return;
        }
    }

    // Validar Paso 3 (Fecha)
    if (paso > 3 && !selectedDate) {
        mostrarAlertaCliente('Selecciona la fecha', 'Por favor marca el día de entrega disponible para tu zona.');
        return;
    }

    for (let i = 1; i <= 4; i++) {
        const body = document.getElementById(`step-body-${i}`);
        const badge = document.getElementById(`step-badge-${i}`);
        if (body) {
            if (i === paso) {
                body.style.display = 'block';
                if (badge) badge.classList.add('step-active');
            } else {
                body.style.display = 'none';
                if (badge) badge.classList.remove('step-active');
            }
        }
    }

    const stepHeader = document.getElementById(`step-header-${paso}`);
    if (stepHeader) stepHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (paso === 3) renderDates();
    if (paso === 4) buildSummary();
}

async function confirmarPedidoTienda() {
    const calc = calculatePrices();
    const nom = (document.getElementById('custNombre')?.value || '').trim();
    const tel = (document.getElementById('custTel')?.value || '').trim();
    const email = (document.getElementById('custEmail')?.value || '').trim();
    const zonaKey = (document.getElementById('custZonaSelect')?.value || '').trim();
    const dir = (document.getElementById('custDir')?.value || '').trim();

    let notasCliente = (document.getElementById('custNotas')?.value || '').trim();
    const esRegalo = document.getElementById('chkEsRegalo')?.checked;

    const zonaNombre = REGLAS_ZONAS[zonaKey] ? REGLAS_ZONAS[zonaKey].nombre : 'Zona';
    const direccionCompleta = `[${zonaNombre}] ${dir}`;

    if (esRegalo) {
        const destinatario = (document.getElementById('custRegaloDestinatario')?.value || '').trim();
        const mensajeRegalo = (document.getElementById('custRegaloMensaje')?.value || '').trim();
        let tagRegalo = `[ES PARA REGALO]`;
        if (destinatario) tagRegalo += ` Para: ${destinatario}.`;
        if (mensajeRegalo) tagRegalo += ` Cartita: "${mensajeRegalo}".`;
        
        notasCliente = `${tagRegalo} ${notasCliente}`.trim();
    }

    let itemsArr = [];
    for(let k in cart) {
        if(cart[k] && cart[k].cantidad > 0) {
            let detalleSalsas = (cart[k].salsas && cart[k].salsas.length > 0) ? ` (Salsas: ${cart[k].salsas.join(', ')})` : '';
            itemsArr.push({
                producto: k + detalleSalsas,
                cantidad: cart[k].cantidad,
                con_jalea: cart[k].con_jalea
            });
        }
    }

    const payload = {
        cliente: nom,
        telefono: tel,
        email: email,
        direccion: direccionCompleta,
        fecha_entrega: selectedDate,
        notas: notasCliente,
        items: itemsArr,
        monto_total: calc.totalMoney
    };

    mostrarCroissLoader();

    try {
        const res = await fetch('/api/public/crear_pedido', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const data = await res.json();

        if (data.status === 'exito') {
            let resumenProductos = [];
            for (let k in cart) {
                if (cart[k] && cart[k].cantidad > 0) {
                    resumenProductos.push(`${cart[k].cantidad}x ${k}`);
                }
            }

            let msgWa = `¡Hola! Acabo de registrar mi pedido *#${data.id}* en la web:%0A%0A` +
                        `👤 *Nombre:* ${nom}%0A` +
                        `📅 *Fecha Entrega:* ${selectedDate}%0A` +
                        `🥐 *Pedido:* ${resumenProductos.join(', ')}%0A` +
                        `💵 *Total:* $${calc.totalMoney}%0A` +
                        `📍 *Dirección:* ${direccionCompleta}%0A%0A` +
                        `Quedo a la espera para coordinar el pago. ¡Muchas gracias!`;

            let linkWhatsApp = `https://wa.me/59899526301?text=${msgWa}`;

            Swal.fire({
                title: '¡Pedido Creado! 🥐',
                text: 'Haz clic abajo para enviarnos tu pedido por WhatsApp y confirmar la fecha.',
                icon: 'success',
                confirmButtonText: '💬 Enviar por WhatsApp',
                customClass: { popup: 'croiss-swal-popup', confirmButton: 'croiss-swal-confirm' },
                allowOutsideClick: false
            }).then(() => {
                window.location.href = linkWhatsApp;
            });
        } else {
            mostrarAlertaCliente('Atención', data.mensaje, 'error');
        }
    } catch(e) {
        mostrarAlertaCliente('Error', 'No se pudo conectar con el servidor', 'error');
    }
}