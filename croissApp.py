import os
import re
import json
import time
import socket
import calendar
import urllib.request
import threading
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request, session, redirect, url_for
import gspread
from google.oauth2.service_account import Credentials
from gspread.exceptions import APIError
import math

# ==========================================
# CONFIGURACIÓN GENERAL Y FLASK
# ==========================================
app = Flask(__name__)

app.secret_key = os.environ.get("FLASK_SECRET_KEY", "croiss_super_secreta_2026")
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=365)

ADMIN_USER = os.environ.get("ADMIN_USER", "admin")
ADMIN_PASS = os.environ.get("ADMIN_PASSWORD", "croisscamigera")

BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
EMAIL_EMISOR = os.environ.get("EMAIL_EMISOR", "pedidos@croissuy.com")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

SPREADSHEET_ID = "1-HZ19zxOZWJXizFSrhb5m6OKJJWQ_207SuRqdLVNWWE"

# ==========================================
# HELPER DE PROTECCIÓN Y REINTENTO ANTE 429
# ==========================================
def ejecutar_con_reintento(func, *args, **kwargs):
    for intento in range(4):
        try:
            return func(*args, **kwargs)
        except APIError as err:
            err_str = str(err)
            if "429" in err_str or (hasattr(err, 'response') and getattr(err.response, 'status_code', None) == 429):
                tiempo_espera = (intento + 1) * 2.5
                print(f"⏳ Cuota Google 429 alcanzada. Reintentando en {tiempo_espera}s...", flush=True)
                time.sleep(tiempo_espera)
            else:
                raise err
    raise Exception("Google Sheets está saturado. Espera 30 segundos y vuelve a intentar.")

# ==========================================
# SEGURIDAD Y LOGIN
# ==========================================
@app.before_request
def verificar_autenticacion():
    if request.endpoint in ['login', 'static']:
        return
    if not session.get('logueado'):
        return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        datos = request.json if request.is_json else request.form
        pwd = datos.get("password", "")

        if pwd == ADMIN_PASS:
            session.permanent = True
            session['logueado'] = True
            if request.is_json:
                return jsonify({"status": "exito", "mensaje": "Sesión iniciada"}), 200
            return redirect(url_for('inicio'))
        else:
            if request.is_json:
                return jsonify({"status": "error", "mensaje": "Contraseña incorrecta"}), 401
            return render_template('login.html', error="Contraseña incorrecta")
    
    if session.get('logueado'):
        return redirect(url_for('inicio'))
        
    return render_template('login.html', error=None)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ==========================================
# HELPER SHEETS Y EMAIL
# ==========================================
def conectar_sheet(nombre_pestaña):
    ruta_credenciales = "credentials.json"
    if not os.path.exists(ruta_credenciales):
        raise FileNotFoundError("No se encontró el archivo credentials.json en la carpeta raíz.")
        
    creds = Credentials.from_service_account_file(ruta_credenciales, scopes=SCOPES)
    cliente = gspread.authorize(creds)
    sheet = cliente.open_by_key(SPREADSHEET_ID)
    return sheet.worksheet(nombre_pestaña)

def asegurar_encabezados_ventas(sheet_ventas):
    headers_esperados = [
        "ID Venta", "Fecha Pedido", "Fecha Entrega", "Cliente",
        "Producto", "Cantidad", "Monto Total", "Estado",
        "Medio de Pago", "Email", "Teléfono", "Dirección", "Entrega", "Notas"
    ]
    try:
        fila_1 = sheet_ventas.row_values(1)
        if not fila_1 or len(fila_1) < len(headers_esperados):
            sheet_ventas.update('A1:N1', [headers_esperados])
    except Exception as e:
        print(f"Aviso verificando encabezados de Ventas: {e}", flush=True)

def normalizar_fecha(fecha_raw):
    if not fecha_raw: return ""
    f_str = str(fecha_raw).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(f_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass
    return f_str

def get_clean_records(sheet):
    try:
        data = sheet.get_all_values()
        if not data or len(data) < 2: return []
        raw_headers = data[0]
        headers = []
        for idx, h in enumerate(raw_headers):
            h_str = str(h).strip()
            if h_str and h_str not in [name for _, name in headers]:
                headers.append((idx, h_str))

        records = []
        for row in data[1:]:
            record = {}
            for col_idx, header_name in headers:
                val = row[col_idx] if col_idx < len(row) else ""
                record[header_name] = val
            records.append(record)
        return records
    except Exception as e:
        print(f"⚠️ Error leyendo registros de {sheet.title}: {e}", flush=True)
        return []

def get_field_val(record, *possible_keys):
    if not record: return ""
    for target in possible_keys:
        target_clean = target.lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u").strip()
        for k, val in record.items():
            k_clean = str(k).lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u").strip()
            if k_clean == target_clean and val:
                return str(val).strip()
    return ""

def enviar_email_async(destinatario, asunto, cuerpo_html):
    def _enviar():
        if not destinatario or "@" not in str(destinatario): return
        api_key = BREVO_API_KEY.strip()
        if not api_key: return

        url = "https://api.brevo.com/v3/smtp/email"
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json"
        }
        payload = {
            "sender": {"name": "CROISS", "email": EMAIL_EMISOR},
            "to": [{"email": destinatario}],
            "subject": asunto,
            "htmlContent": cuerpo_html
        }
        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=10) as response: pass
        except Exception as e:
            print(f"❌ Error enviando correo: {e}", flush=True)

    threading.Thread(target=_enviar).start()

# --- PLANTILLAS DE EMAIL ---
def plantilla_email_confirmacion(cliente, items_str, fecha_entrega, total, estado_pago="Pendiente"):
    badge_pago = "Pagado" if estado_pago.lower() == "pagado" else "Pendiente de Pago"
    return f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; background: #FAF9F8;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 16px;">
        <h2 style="color: #C86D28;">¡Hola, {cliente}! ✨</h2>
        <p>Tu pedido está confirmado para el {fecha_entrega}:</p>
        <p><strong>📦 {items_str}</strong></p>
        <p>Total: <strong>${total}</strong> ({badge_pago})</p>
      </div>
    </div>
    """

def plantilla_email_pago_recibido(cliente, monto):
    return f"<h2>¡Pago Recibido!</h2><p>Hola {cliente}, registramos tu pago de ${monto}.</p>"

def plantilla_email_entregado(cliente, link_google_review="https://share.google/dTCn5wDuysp01wARR"):
    return f"<h2>¡Pedido Entregado! 🥐</h2><p>Gracias {cliente}. Podés dejarnos tu reseña en Google: {link_google_review}</p>"

def plantilla_email_cancelado(cliente, items_str):
    return f"""
    <div style="font-family: Arial, sans-serif; padding: 20px; background: #FAF9F8;">
      <div style="max-width: 480px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 16px;">
        <h2 style="color: #DC2626;">Pedido Cancelado ❌</h2>
        <p>Hola <strong>{cliente}</strong>,</p>
        <p>Te confirmamos que tu orden (<strong>{items_str}</strong>) ha sido cancelada.</p>
        <p>Si deseas reprogramar o fue un error, no dudes en responder a este correo.</p>
      </div>
    </div>
    """

# ==========================================
# GESTIÓN DE CLIENTES & INSUMOS
# ==========================================
def obtener_o_crear_sheet_clientes():
    ruta_credenciales = "credentials.json"
    creds = Credentials.from_service_account_file(ruta_credenciales, scopes=SCOPES)
    cliente = gspread.authorize(creds)
    doc = cliente.open_by_key(SPREADSHEET_ID)
    try:
        return doc.worksheet("Clientes")
    except Exception:
        ws = doc.add_worksheet(title="Clientes", rows="100", cols="5")
        ws.append_row(["ID Cliente", "Nombre", "Email", "Telefono", "Direccion"])
        return ws

def obtener_o_crear_sheet_insumos():
    ruta_credenciales = "credentials.json"
    creds = Credentials.from_service_account_file(ruta_credenciales, scopes=SCOPES)
    cliente = gspread.authorize(creds)
    doc = cliente.open_by_key(SPREADSHEET_ID)
    try:
        return doc.worksheet("Insumos_Stock")
    except Exception:
        ws = doc.add_worksheet(title="Insumos_Stock", rows="100", cols="10")
        ws.append_row(["Insumo", "Stock Actual", "Unidad", "Vencimiento Proximo"])
        return ws

def sincronizar_cliente(nombre, email, telefono, direccion):
    if not nombre or nombre.lower() == "consumidor final": return
    if "@" in str(nombre) and "@" not in str(email): nombre, email = email, nombre

    try:
        sheet = obtener_o_crear_sheet_clientes()
        registros = get_clean_records(sheet)
        for idx, reg in enumerate(registros, start=2):
            val_nom = get_field_val(reg, "Nombre", "Cliente", "Nombre Cliente")
            if val_nom and val_nom.lower() == nombre.lower():
                id_existente = get_field_val(reg, "ID Cliente", "ID") or f"CLI-{idx-1:04d}"
                ejecutar_con_reintento(sheet.update, f"A{idx}:E{idx}", [[id_existente, nombre, email, telefono, direccion]])
                return
        
        nuevo_id = f"CLI-{len(registros) + 1:04d}"
        ejecutar_con_reintento(sheet.append_row, [nuevo_id, nombre, email, telefono, direccion])
    except Exception as e:
        print(f"Aviso sincronizando cliente: {e}", flush=True)

# ==========================================
# CÁLCULO DE COSTO Y EMPAQUES
# ==========================================
def calcular_costo_y_empaque_pedido(desc_producto, total_croissants):
    if total_croissants <= 0:
        return {"costo_base": 0.0, "costo_empaque": 0.0, "costo_total": 0.0, "cajas_grande": 0, "cajas_mediana": 0, "cajas_chica": 0, "papel": 0}
    
    costo_croissants = 0.0
    if desc_producto:
        partes = str(desc_producto).split(",")
        croissants_procesados = 0
        for item in partes:
            item_clean = item.strip()
            if not item_clean: continue
            sin_jalea_str = re.sub(r"\(con jalea\)", "", item_clean, flags=re.IGNORECASE).strip()
            m = re.match(r"^(\d+)x\s+(.+)", sin_jalea_str, re.IGNORECASE)
            if m:
                c_item = int(m.group(1))
                sabor_item = m.group(2).strip().lower()
            else:
                c_item = 1
                sabor_item = sin_jalea_str.lower()
            
            c_unit = 24.10
            if "jamon" in sabor_item or "jamón" in sabor_item or "queso" in sabor_item:
                c_unit += 25.75
            elif "dulce" in sabor_item or "ddl" in sabor_item:
                c_unit += 16.80
            
            costo_croissants += (c_unit * c_item)
            croissants_procesados += c_item
            
        if croissants_procesados < total_croissants:
            faltantes = total_croissants - croissants_procesados
            costo_croissants += (faltantes * 24.10)
    else:
        costo_croissants = total_croissants * 24.10

    cajas_grande = total_croissants // 6
    sobrante = total_croissants % 6
    cajas_mediana = 0
    cajas_chica = 0
    
    if sobrante == 1: cajas_chica = 1
    elif sobrante in (2, 3): cajas_mediana = 1
    elif sobrante == 4:
        cajas_mediana = 1
        cajas_chica = 1
    elif sobrante == 5: cajas_grande += 1
        
    papel = cajas_grande + cajas_mediana + cajas_chica
    costo_empaque = (cajas_grande * 36.0) + (cajas_mediana * 27.0) + (cajas_chica * 18.0)
    
    return {
        "costo_base": round(costo_croissants, 2),
        "costo_empaque": round(costo_empaque, 2),
        "costo_total": round(costo_croissants + costo_empaque, 2),
        "cajas_grande": cajas_grande,
        "cajas_mediana": cajas_mediana,
        "cajas_chica": cajas_chica,
        "papel": papel
    }

def modificar_stock_empaque(desc_producto, total_croissants, es_devolucion=False):
    alertas = []
    try:
        calculo = calcular_costo_y_empaque_pedido(desc_producto, total_croissants)
        cajas_x6, cajas_x3, cajas_x1, papel = calculo["cajas_grande"], calculo["cajas_mediana"], calculo["cajas_chica"], calculo["papel"]

        sheet_insumos = obtener_o_crear_sheet_insumos()
        registros = get_clean_records(sheet_insumos)
        if not registros: return alertas

        modificaciones, nombres_alertas = {}, {}

        def aplicar_cambio(palabra_clave, cantidad):
            if cantidad <= 0: return
            for idx, ins_row in enumerate(registros, start=2):
                nombre_insumo = get_field_val(ins_row, "Insumo").lower()
                if palabra_clave in nombre_insumo:
                    raw_st = get_field_val(ins_row, "Stock Actual").replace(",", ".").strip()
                    stock_actual = float(raw_st) if raw_st else 0.0
                    if idx in modificaciones: stock_actual = modificaciones[idx]
                    
                    if es_devolucion:
                        nuevo_stock = round(stock_actual + cantidad, 2)
                    else:
                        nuevo_stock = max(0.0, round(stock_actual - cantidad, 2))
                        if nuevo_stock <= 10:
                            nombres_alertas[get_field_val(ins_row, "Insumo")] = int(nuevo_stock)

                    modificaciones[idx] = nuevo_stock
                    break

        aplicar_cambio("x6", cajas_x6)
        aplicar_cambio("x3", cajas_x3)
        aplicar_cambio("x1", cajas_x1)
        aplicar_cambio("papel", papel)

        for row_idx, n_stock in modificaciones.items():
            ejecutar_con_reintento(sheet_insumos.update_cell, row_idx, 2, n_stock)

        for ins, stock in nombres_alertas.items():
            alertas.append(f"Solo quedan {stock} unidades de {ins}")

    except Exception as e:
        print(f"Aviso modificando empaque/stock: {e}", flush=True)

    return alertas

# ==========================================
# RUTAS DE VISTA Y API CONGELADOS INDEPENDIENTES
# ==========================================
@app.route('/')
def inicio():
    return render_template('index.html')

def obtener_celda_congelados(sheet_stock):
    try:
        celda = sheet_stock.find(re.compile(r"^croissants congelados$", re.IGNORECASE))
        if celda: return celda
        celda_alt = sheet_stock.find(re.compile(r"congelado", re.IGNORECASE))
        if celda_alt: return celda_alt
    except Exception: pass
    
    ejecutar_con_reintento(sheet_stock.append_row, ["CONG-001", "Croissants Congelados", 0, 0])
    return sheet_stock.find(re.compile(r"congelado", re.IGNORECASE))

def obtener_celda_sobrevendidos(sheet_stock):
    try:
        celda = sheet_stock.find(re.compile(r"sobrevendido", re.IGNORECASE))
        if celda: return celda
    except Exception: pass
    
    ejecutar_con_reintento(sheet_stock.append_row, ["SOBR-001", "Croissants Sobrevendidos", 0, 0])
    return sheet_stock.find(re.compile(r"sobrevendido", re.IGNORECASE))

def obtener_niveles_stock(sheet_stock):
    c_cong = obtener_celda_congelados(sheet_stock)
    
    try:
        c_masas = sheet_stock.find(re.compile(r"masas", re.IGNORECASE))
    except Exception: c_masas = None
    
    if not c_masas:
        ejecutar_con_reintento(sheet_stock.append_row, ["MASA-001", "Masas Heladera", 0, 0])
        c_masas = sheet_stock.find(re.compile(r"masas", re.IGNORECASE))

    headers = [str(h).strip().lower() for h in sheet_stock.row_values(1)]
    col_stock = 4
    for idx, h in enumerate(headers, start=1):
        if "stock" in h: col_stock = idx; break

    def _leer(celda):
        if not celda: return 0
        val = sheet_stock.cell(celda.row, col_stock).value or "0"
        val_clean = str(val).replace(",", ".").strip()
        try: return max(0, int(float(val_clean)))
        except ValueError: return 0

    return c_cong, c_masas, col_stock, _leer(c_cong), _leer(c_masas)
    
@app.route('/api/agenda', methods=['GET'])
def obtener_agenda():
    try:
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        registros = get_clean_records(sheet_ventas)
        
        hoy = datetime.now().date()
        dias_agenda = {}
        nombres_dias = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"]
        
        for i in range(7):
            fecha_dt = hoy + timedelta(days=i)
            fecha_str = fecha_dt.strftime("%Y-%m-%d")
            dias_agenda[fecha_str] = {
                "fecha": fecha_str,
                "nombre_dia": f"{nombres_dias[fecha_dt.weekday()]} {fecha_dt.strftime('%d/%m')}",
                "pedidos": [],
                "total_croissants": 0
            }
        
        for idx, reg in enumerate(registros, start=2):
            estado_entrega = get_field_val(reg, "Entrega", "Estado Entrega", "Estado de Entrega")
            if estado_entrega and "entregad" in estado_entrega.lower(): continue

            f_entrega_norm = normalizar_fecha(get_field_val(reg, "Fecha Entrega", "Fecha"))

            if f_entrega_norm in dias_agenda:
                cant_str = get_field_val(reg, "Cantidad")
                cant = int(cant_str) if cant_str.isdigit() else 0
                dias_agenda[f_entrega_norm]["pedidos"].append({
                    "fila": idx,
                    "id": get_field_val(reg, "ID Venta", "ID"),
                    "cliente": get_field_val(reg, "Cliente"),
                    "descripcion": get_field_val(reg, "Producto"),
                    "cantidad": cant,
                    "estado": get_field_val(reg, "Estado"),
                    "direccion": get_field_val(reg, "Dirección", "Direccion"),
                    "telefono": get_field_val(reg, "Teléfono", "Telefono", "Tel"),
                    "email": get_field_val(reg, "Email", "Correo"),
                    "notas": get_field_val(reg, "Notas", "Nota", "Comentario", "Observaciones")
                })
                dias_agenda[f_entrega_norm]["total_croissants"] += cant
                
        return jsonify({"status": "exito", "agenda": list(dias_agenda.values())}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/congelados', methods=['GET', 'POST'])
def stock_congelados():
    try:
        sheet_stock = conectar_sheet("Productos_Stock")
        c_cong, c_masas, col_stock, st_cong, st_masas = obtener_niveles_stock(sheet_stock)

        if request.method == 'POST':
            datos = request.json or {}
            st_cong += int(datos.get("congelados", 0))
            st_masas += int(datos.get("masas", 0))
            if c_cong: ejecutar_con_reintento(sheet_stock.update_cell, c_cong.row, col_stock, st_cong)
            if c_masas: ejecutar_con_reintento(sheet_stock.update_cell, c_masas.row, col_stock, st_masas)

        return jsonify({
            "status": "exito",
            "congelados": st_cong,
            "masas": st_masas,
            "capacidad_total": st_cong + (st_masas * 10),
            "mensaje": "Stock actualizado"
        }), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/congelados/fijar', methods=['POST'])
def fijar_stock_congelados():
    try:
        datos = request.json or {}
        st_cong = max(0, int(datos.get("congelados", 0)))
        st_masas = max(0, int(datos.get("masas", 0)))

        sheet_stock = conectar_sheet("Productos_Stock")
        c_cong, c_masas, col_stock, _, _ = obtener_niveles_stock(sheet_stock)

        if c_cong: ejecutar_con_reintento(sheet_stock.update_cell, c_cong.row, col_stock, st_cong)
        if c_masas: ejecutar_con_reintento(sheet_stock.update_cell, c_masas.row, col_stock, st_masas)

        return jsonify({
            "status": "exito", 
            "congelados": st_cong,
            "masas": st_masas,
            "capacidad_total": st_cong + (st_masas * 10),
            "mensaje": "Valores fijados correctamente"
        }), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500
        

@app.route('/api/venta', methods=['POST'])
def registrar_venta():
    try:
        datos = request.json or {}
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        sheet_stock = conectar_sheet("Productos_Stock")
        
        items = datos.get("items", [])
        total_unidades = sum(int(item.get("cantidad", 1)) for item in items)
        
        c_cong, c_masas, col_stock, st_cong, st_masas = obtener_niveles_stock(sheet_stock)
        capacidad_total = st_cong + (st_masas * 10)

        if total_unidades > capacidad_total:
            return jsonify({
                "status": "error",
                "mensaje": f"🚫 Capacidad insuficiente. Tienes {st_cong} croiss congelados + {st_masas} masa(s) (Capacidad total: {capacidad_total}) e intentas vender {total_unidades}."
            }), 400

        # Descuenta primero de congelados sueltos; si faltan, rompe las masas necesarias
        if total_unidades <= st_cong:
            st_cong -= total_unidades
        else:
            restante = total_unidades - st_cong
            st_cong = 0
            masas_a_romper = math.ceil(restante / 10.0)
            st_masas -= masas_a_romper
            st_cong += (masas_a_romper * 10) - restante

        if c_cong: ejecutar_con_reintento(sheet_stock.update_cell, c_cong.row, col_stock, st_cong)
        if c_masas: ejecutar_con_reintento(sheet_stock.update_cell, c_masas.row, col_stock, st_masas)

        registros = get_clean_records(sheet_ventas)
        nuevo_id = f"V-{len(registros) + 1:04d}"
        resumen_productos = []
        
        for item in items:
            prod_nombre = item.get("producto")
            cant = int(item.get("cantidad", 1))
            jalea_str = " (Con Jalea)" if item.get("con_jalea") else ""
            resumen_productos.append(f"{cant}x {prod_nombre}{jalea_str}")

        descripcion_final = ", ".join(resumen_productos)
        alertas_empaque = modificar_stock_empaque(descripcion_final, total_unidades, es_devolucion=False)

        cliente_nombre = datos.get("cliente", "Consumidor Final")
        email_cliente = str(datos.get("email", "")).strip()
        telefono_cliente = str(datos.get("telefono", "")).strip()
        direccion_cliente = str(datos.get("direccion", "")).strip()
        fecha_entrega = datos.get("fecha_entrega", datos.get("fecha"))
        monto_total = datos.get("monto_total", 0)
        estado_pedido = datos.get("estado", "Pendiente")
        notas_cliente = str(datos.get("notas", "")).strip()
        
        nueva_fila = [
            nuevo_id, datos.get("fecha"), fecha_entrega, cliente_nombre,
            descripcion_final, total_unidades, monto_total, estado_pedido,
            datos.get("medio_pago", "-"), email_cliente, telefono_cliente,
            direccion_cliente, "Pendiente", notas_cliente
        ]
        ejecutar_con_reintento(sheet_ventas.append_row, nueva_fila)

        if email_cliente:
            try:
                html = plantilla_email_confirmacion(cliente_nombre, descripcion_final, fecha_entrega, monto_total, estado_pedido)
                enviar_email_async(email_cliente, "🥐 ¡Tu pedido en CROISS está confirmado!", html)
            except Exception: pass

        try: sincronizar_cliente(cliente_nombre, email_cliente, telefono_cliente, direccion_cliente)
        except Exception: pass

        return jsonify({"status": "exito", "mensaje": "Pedido registrado correctamente", "id": nuevo_id, "alertas": alertas_empaque}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/eliminar_venta', methods=['POST'])
def eliminar_venta():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        notificar_cliente = datos.get("notificar", False)

        if not num_fila: return jsonify({"status": "error", "mensaje": "Fila no especificada"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        row_data = sheet_ventas.row_values(int(num_fila))
        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        
        col_cant, col_prod, col_cli, col_email, col_tel, col_dir = 6, 5, 4, 10, 11, 12
        for i, h in enumerate(headers, start=1):
            if "cantidad" in h: col_cant = i
            elif "producto" in h: col_prod = i
            elif "cliente" in h: col_cli = i
            elif "email" in h or "correo" in h: col_email = i
            elif "tel" in h: col_tel = i
            elif "direc" in h: col_dir = i

        cli_nom = row_data[col_cli - 1].strip() if col_cli - 1 < len(row_data) else ""
        cli_email = row_data[col_email - 1].strip() if col_email - 1 < len(row_data) else ""
        cli_tel = row_data[col_tel - 1].strip() if col_tel - 1 < len(row_data) else ""
        cli_dir = row_data[col_dir - 1].strip() if col_dir - 1 < len(row_data) else ""

        if cli_nom: sincronizar_cliente(cli_nom, cli_email, cli_tel, cli_dir)

        cant_recuperar = 0
        if col_cant - 1 < len(row_data):
            val_cant = str(row_data[col_cant - 1]).strip()
            if val_cant.isdigit(): cant_recuperar = int(val_cant)

        desc_prod = row_data[col_prod - 1].strip() if col_prod - 1 < len(row_data) else ""

        if cant_recuperar > 0:
            try:
                sheet_stock = conectar_sheet("Productos_Stock")
                celda_cong = obtener_celda_congelados(sheet_stock)
                if celda_cong:
                    f_cong = celda_cong.row
                    headers_s = [str(h).strip().lower() for h in sheet_stock.row_values(1)]
                    col_stock = 4
                    for idx, h in enumerate(headers_s, start=1):
                        if "stock" in h: col_stock = idx; break

                    raw_st = sheet_stock.cell(f_cong, col_stock).value or "0"
                    val_clean = str(raw_st).replace(",", ".").strip()
                    st_actual = int(float(val_clean)) if val_clean.replace(".", "", 1).isdigit() else 0
                    ejecutar_con_reintento(sheet_stock.update_cell, f_cong, col_stock, st_actual + cant_recuperar)
            except Exception: pass

            modificar_stock_empaque(desc_prod, cant_recuperar, es_devolucion=True)

        if notificar_cliente and cli_email and "@" in cli_email:
            try:
                html_canc = plantilla_email_cancelado(cli_nom, desc_prod)
                enviar_email_async(cli_email, "❌ Tu pedido en CROISS ha sido cancelado", html_canc)
            except Exception: pass

        ejecutar_con_reintento(sheet_ventas.delete_rows, int(num_fila))
        return jsonify({"status": "exito", "mensaje": "Orden procesada y stock devuelto correctamente."}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500
        
# ==========================================
# RUTAS DE CLIENTES Y CRM
# ==========================================
@app.route('/api/clientes', methods=['GET'])
def obtener_clientes():
    try:
        mes_filtro = request.args.get('mes', '').strip() or datetime.now().strftime("%Y-%m")
        clientes_historico, clientes_mes = {}, {}

        sheet_crm = obtener_o_crear_sheet_clientes()
        crm_records = get_clean_records(sheet_crm)
        
        for c in crm_records:
            id_cli = get_field_val(c, "ID Cliente", "ID", "Id Cliente", "Id").strip()
            nom = get_field_val(c, "Nombre", "Cliente", "Nombre Cliente").strip()
            email = get_field_val(c, "Email", "Correo").strip()
            tel = get_field_val(c, "Telefono", "Teléfono", "Tel").strip()
            direccion = get_field_val(c, "Direccion", "Dirección").strip()

            if "@" in nom and "@" not in email: nom, email = email, nom
            if not nom or nom.lower() == "consumidor final": continue
                
            key_norm = nom.lower()
            clientes_historico[key_norm] = {
                "id_cliente": id_cli, "nombre": nom, "email": email, "telefono": tel, "direccion": direccion,
                "total_gastado": 0.0, "total_croissants": 0, "total_pedidos": 0, "historial": []
            }

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        ventas = get_clean_records(sheet_ventas)

        for idx, v in enumerate(ventas, start=2):
            cliente_nombre = get_field_val(v, "Cliente").strip() or "Consumidor Final"
            if not cliente_nombre or cliente_nombre.lower() == "consumidor final": continue

            email_c, tel_c, dir_c = get_field_val(v, "Email", "Correo").strip(), get_field_val(v, "Teléfono", "Telefono", "Tel").strip(), get_field_val(v, "Dirección", "Direccion").strip()
            fecha_norm = normalizar_fecha(get_field_val(v, "Fecha Pedido", "Fecha", "Fecha Entrega"))
            
            try: monto = float(get_field_val(v, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip())
            except ValueError: monto = 0.0

            cant = int(get_field_val(v, "Cantidad")) if get_field_val(v, "Cantidad").isdigit() else 0
            key_norm = cliente_nombre.lower()

            pedido_item = {
                "fila": idx, "id": get_field_val(v, "ID Venta", "ID"), "fecha": fecha_norm,
                "producto": get_field_val(v, "Producto"), "cantidad": cant, "monto": monto,
                "estado_pago": get_field_val(v, "Estado") or "Pendiente",
                "estado_entrega": get_field_val(v, "Entrega", "Estado Entrega") or "Sin Registrar",
                "direccion": dir_c
            }

            if key_norm not in clientes_historico:
                clientes_historico[key_norm] = {
                    "id_cliente": "", "nombre": cliente_nombre, "email": email_c, "telefono": tel_c, "direccion": dir_c,
                    "total_gastado": 0.0, "total_croissants": 0, "total_pedidos": 0, "historial": []
                }

            clientes_historico[key_norm]["total_gastado"] += monto
            clientes_historico[key_norm]["total_croissants"] += cant
            clientes_historico[key_norm]["total_pedidos"] += 1
            clientes_historico[key_norm]["historial"].append(pedido_item)

            if fecha_norm and fecha_norm.startswith(mes_filtro):
                if key_norm not in clientes_mes:
                    clientes_mes[key_norm] = {
                        "id_cliente": clientes_historico[key_norm]["id_cliente"],
                        "nombre": clientes_historico[key_norm]["nombre"],
                        "email": clientes_historico[key_norm]["email"],
                        "telefono": clientes_historico[key_norm]["telefono"],
                        "direccion": clientes_historico[key_norm]["direccion"],
                        "total_gastado": 0.0, "total_croissants": 0, "total_pedidos": 0, "historial": []
                    }

                clientes_mes[key_norm]["total_gastado"] += monto
                clientes_mes[key_norm]["total_croissants"] += cant
                clientes_mes[key_norm]["total_pedidos"] += 1
                clientes_mes[key_norm]["historial"].append(pedido_item)

        lista_historico = list(clientes_historico.values())
        lista_historico.sort(key=lambda x: x["nombre"].lower())
        for c in lista_historico:
            c["total_gastado"] = round(c["total_gastado"], 2)
            c["historial"].sort(key=lambda x: str(x["fecha"]), reverse=True)

        lista_mes = list(clientes_mes.values())
        lista_mes.sort(key=lambda x: (x["total_croissants"], x["total_gastado"]), reverse=True)
        for c in lista_mes: c["total_gastado"] = round(c["total_gastado"], 2)

        return jsonify({
            "status": "exito", "mes_filtrado": mes_filtro,
            "clientes_todos": lista_historico, "ranking_mes": lista_mes,
            "top_cliente_mes": lista_mes[0] if lista_mes else None
        }), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cliente/editar', methods=['POST'])
def editar_cliente():
    try:
        datos = request.json or {}
        id_cliente = str(datos.get("id_cliente", "")).strip()
        nombre_original = str(datos.get("nombre_original", datos.get("nombre", ""))).strip()
        nuevo_nombre = str(datos.get("nombre", "")).strip() or nombre_original
        nuevo_email, nuevo_telefono, nueva_direccion = str(datos.get("email", "")).strip(), str(datos.get("telefono", "")).strip(), str(datos.get("direccion", "")).strip()

        sheet_crm = obtener_o_crear_sheet_clientes()
        data_crm = sheet_crm.get_all_values()
        
        if data_crm and len(data_crm) >= 2:
            for idx, row in enumerate(data_crm[1:], start=2):
                val_id = row[0].strip() if len(row) > 0 else ""
                val_nom = row[1].strip() if len(row) > 1 else ""
                if (id_cliente and val_id.lower() == id_cliente.lower()) or (val_nom.lower() == nombre_original.lower()):
                    id_final = val_id or id_cliente or f"CLI-{idx-1:04d}"
                    ejecutar_con_reintento(sheet_crm.update, f"A{idx}:E{idx}", [[id_final, nuevo_nombre, nuevo_email, nuevo_telefono, nueva_direccion]])
                    break

        sheet_ventas = conectar_sheet("Ventas")
        data_v = sheet_ventas.get_all_values()
        if data_v and len(data_v) >= 2:
            headers = [str(h).strip().lower() for h in data_v[0]]
            col_cliente = headers.index("cliente") + 1 if "cliente" in headers else 4
            for idx, row in enumerate(data_v[1:], start=2):
                val_cli = row[col_cliente - 1] if col_cliente - 1 < len(row) else ""
                if val_cli.strip().lower() == nombre_original.lower():
                    ejecutar_con_reintento(sheet_ventas.update, f"D{idx}", [[nuevo_nombre]])
                    ejecutar_con_reintento(sheet_ventas.update, f"J{idx}:L{idx}", [[nuevo_email, nuevo_telefono, nueva_direccion]])

        return jsonify({"status": "exito", "mensaje": "Cliente actualizado correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cliente/eliminar', methods=['POST'])
def eliminar_cliente():
    try:
        datos = request.json or {}
        nombre_cliente, id_cliente = str(datos.get("nombre", "")).strip(), str(datos.get("id_cliente", "")).strip()
        sheet_crm = obtener_o_crear_sheet_clientes()
        data_crm = sheet_crm.get_all_values()
        
        if data_crm and len(data_crm) >= 2:
            for idx, row in enumerate(data_crm[1:], start=2):
                val_id = row[0].strip() if len(row) > 0 else ""
                val_nom = row[1].strip() if len(row) > 1 else ""
                if (id_cliente and val_id.lower() == id_cliente.lower()) or (nombre_cliente and val_nom.lower() == nombre_cliente.lower()):
                    ejecutar_con_reintento(sheet_crm.delete_rows, idx)
                    break

        return jsonify({"status": "exito", "mensaje": "Cliente eliminado correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

# ==========================================
# BALANCE, CUENTAS Y OTROS ENDPOINTS
# ==========================================
@app.route('/api/balance', methods=['GET'])
def obtener_balance():
    try:
        mes_filtro = request.args.get('mes', '').strip() or datetime.now().strftime("%Y-%m")
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        sheet_gastos = conectar_sheet("Gastos")

        ventas, gastos = get_clean_records(sheet_ventas), get_clean_records(sheet_gastos)
        ingresos_mes, costos_prod_mes, pedidos_count_mes, total_croiss_mes = 0.0, 0.0, 0, 0
        total_croiss_historico, total_pedidos_historico, total_ingresos_historico = 0, 0, 0.0
        con_jalea_count, sin_jalea_count = 0, 0
        sabores_dict = {}
        dias_semana_count = {"LUNES": 0, "MARTES": 0, "MIÉRCOLES": 0, "JUEVES": 0, "VIERNES": 0, "SÁBADO": 0, "DOMINGO": 0}
        nombres_dias = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"]

        historico_dict, clientes_mes_dict, clientes_historico_dict = {}, {}, {}

        for v in ventas:
            f_norm = normalizar_fecha(get_field_val(v, "Fecha Pedido", "Fecha"))
            if not f_norm or len(f_norm) < 7: continue

            key_mes = f_norm[:7]
            if key_mes not in historico_dict:
                historico_dict[key_mes] = {"ingresos": 0.0, "costos": 0.0, "gastos": 0.0, "pedidos": 0, "croissants": 0}

            try: monto = float(get_field_val(v, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip())
            except ValueError: monto = 0.0

            raw_cant = get_field_val(v, "Cantidad")
            cant = int(raw_cant) if raw_cant.isdigit() else 0
            desc_prod = get_field_val(v, "Producto")

            datos_costo = calcular_costo_y_empaque_pedido(desc_prod, cant)
            costo_pedido = datos_costo["costo_total"]

            total_croiss_historico += cant
            total_pedidos_historico += 1
            total_ingresos_historico += monto

            historico_dict[key_mes]["ingresos"] += monto
            historico_dict[key_mes]["costos"] += costo_pedido
            historico_dict[key_mes]["pedidos"] += 1
            historico_dict[key_mes]["croissants"] += cant

            cli_nombre = get_field_val(v, "Cliente").strip()
            if cli_nombre and cli_nombre.lower() != "consumidor final":
                c_key = cli_nombre.lower()
                if c_key not in clientes_historico_dict:
                    clientes_historico_dict[c_key] = {"nombre": cli_nombre, "croissants": 0, "gastado": 0.0, "pedidos": 0}
                clientes_historico_dict[c_key]["croissants"] += cant
                clientes_historico_dict[c_key]["gastado"] += monto
                clientes_historico_dict[c_key]["pedidos"] += 1

                if f_norm.startswith(mes_filtro):
                    if c_key not in clientes_mes_dict:
                        clientes_mes_dict[c_key] = {"nombre": cli_nombre, "croissants": 0, "gastado": 0.0, "pedidos": 0}
                    clientes_mes_dict[c_key]["croissants"] += cant
                    clientes_mes_dict[c_key]["gastado"] += monto
                    clientes_mes_dict[c_key]["pedidos"] += 1

            if f_norm.startswith(mes_filtro):
                ingresos_mes += monto
                costos_prod_mes += costo_pedido
                pedidos_count_mes += 1
                total_croiss_mes += cant

                try:
                    dt_v = datetime.strptime(f_norm, "%Y-%m-%d")
                    dias_semana_count[nombres_dias[dt_v.weekday()]] += cant
                except Exception: pass

                if desc_prod:
                    for item in desc_prod.split(","):
                        item_clean = item.strip()
                        if not item_clean: continue
                        tiene_jalea = "(con jalea)" in item_clean.lower()
                        sin_jalea_str = re.sub(r"\(con jalea\)", "", item_clean, flags=re.IGNORECASE).strip()
                        m = re.match(r"^(\d+)x\s+(.+)", sin_jalea_str, re.IGNORECASE)
                        if m:
                            c_item, sabor_item = int(m.group(1)), m.group(2).strip()
                        else:
                            c_item, sabor_item = 1, sin_jalea_str

                        if sabor_item not in sabores_dict: sabores_dict[sabor_item] = {"cantidad": 0}
                        sabores_dict[sabor_item]["cantidad"] += c_item

                        if tiene_jalea: con_jalea_count += c_item
                        else: sin_jalea_count += c_item

        gastos_mes = 0.0
        gastos_cat_dict = {}
        CATEGORIAS_IGNORAR = ["materia prima", "embalaje", "insumo", "insumos", "caja", "cajas"]

        for g in gastos:
            f_norm = normalizar_fecha(get_field_val(g, "Fecha"))
            if not f_norm or len(f_norm) < 7: continue
            cat_nombre = get_field_val(g, "Categoria", "Categoría") or "Otros"
            if any(cat_ign in cat_nombre.lower().strip() for cat_ign in CATEGORIAS_IGNORAR): continue

            key_mes = f_norm[:7]
            if key_mes not in historico_dict:
                historico_dict[key_mes] = {"ingresos": 0.0, "costos": 0.0, "gastos": 0.0, "pedidos": 0, "croissants": 0}

            try: monto_g = float(get_field_val(g, "Monto").replace("$", "").replace(",", ".").strip())
            except ValueError: monto_g = 0.0

            historico_dict[key_mes]["gastos"] += monto_g
            if f_norm.startswith(mes_filtro):
                gastos_mes += monto_g
                gastos_cat_dict[cat_nombre] = gastos_cat_dict.get(cat_nombre, 0.0) + monto_g

        gastos_por_categoria = [{"categoria": k, "monto": round(v, 2), "porcentaje": round((v / gastos_mes * 100), 1) if gastos_mes > 0 else 0} for k, v in sorted(gastos_cat_dict.items(), key=lambda x: x[1], reverse=True)]
        ganancia_neta_mes = ingresos_mes - (costos_prod_mes + gastos_mes)
        ticket_promedio = round(ingresos_mes / pedidos_count_mes, 2) if pedidos_count_mes > 0 else 0.0

        es_mes_actual = (mes_filtro == datetime.now().strftime("%Y-%m"))
        proy_croiss, proy_ingresos = total_croiss_mes, ingresos_mes

        if es_mes_actual and datetime.now().day > 0:
            dias_totales = calendar.monthrange(datetime.now().year, datetime.now().month)[1]
            proy_croiss = int(round((total_croiss_mes / datetime.now().day) * dias_totales))
            proy_ingresos = round((ingresos_mes / datetime.now().day) * dias_totales, 2)

        top_mes = max(clientes_mes_dict.values(), key=lambda x: x["croissants"]) if clientes_mes_dict else None
        top_historico = max(clientes_historico_dict.values(), key=lambda x: x["croissants"]) if clientes_historico_dict else None

        ranking_sabores = [{"sabor": sab, "cantidad": vals["cantidad"], "porcentaje": round((vals["cantidad"] / total_croiss_mes * 100), 1) if total_croiss_mes > 0 else 0} for sab, vals in sabores_dict.items()]
        lista_historica = [{"mes_key": m_key, "ingresos": round(v["ingresos"], 2), "gastos_totales": round(v["costos"] + v["gastos"], 2), "ganancia_neta": round(v["ingresos"] - (v["costos"] + v["gastos"]), 2), "pedidos": v["pedidos"], "croissants": v["croissants"]} for m_key, v in sorted(historico_dict.items())]

        return jsonify({
            "status": "exito", "mes_filtrado": mes_filtro, "ingresos": round(ingresos_mes, 2),
            "costos_produccion": round(costos_prod_mes, 2), "gastos_varios": round(gastos_mes, 2),
            "gastos_por_categoria": gastos_por_categoria, "ganancia_neta": round(ganancia_neta_mes, 2),
            "ticket_promedio": ticket_promedio, "total_croissants_mes": total_croiss_mes,
            "total_croissants_historico": total_croiss_historico,
            "proyeccion": {"es_mes_actual": es_mes_actual, "croissants_estimados": proy_croiss, "ingresos_estimados": proy_ingresos},
            "top_clientes": {"mes": top_mes, "historico": top_historico},
            "stats_jalea": {"con_jalea": con_jalea_count, "sin_jalea": sin_jalea_count, "porcentaje": round((con_jalea_count / (con_jalea_count + sin_jalea_count) * 100), 1) if (con_jalea_count + sin_jalea_count) > 0 else 0},
            "ranking_sabores": ranking_sabores, "dias_semana": dias_semana_count, "historico_meses": lista_historica
        }), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/editar_pedido', methods=['POST'])
def editar_pedido():
    try:
        datos = request.json or {}
        num_fila, nuevo_producto, nueva_cantidad = datos.get("fila"), datos.get("producto"), datos.get("cantidad")
        if not num_fila or nuevo_producto is None: return jsonify({"status": "error", "mensaje": "Faltan datos requeridos"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        col_producto = headers.index("producto") + 1 if "producto" in headers else 5
        col_cantidad = headers.index("cantidad") + 1 if "cantidad" in headers else 6

        ejecutar_con_reintento(sheet_ventas.update_cell, int(num_fila), col_producto, str(nuevo_producto))
        if nueva_cantidad is not None:
            ejecutar_con_reintento(sheet_ventas.update_cell, int(num_fila), col_cantidad, int(nueva_cantidad))

        return jsonify({"status": "exito", "mensaje": "Pedido actualizado correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cuentas', methods=['GET'])
def obtener_cuentas():
    try:
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        registros = get_clean_records(sheet_ventas)
        hoy_str = datetime.now().date().strftime("%Y-%m-%d")

        pendientes_pago, pendientes_entrega, total_por_cobrar = [], [], 0.0

        for idx, reg in enumerate(registros, start=2):
            cliente = get_field_val(reg, "Cliente") or "Cliente"
            prod = get_field_val(reg, "Producto")
            cant = int(get_field_val(reg, "Cantidad")) if get_field_val(reg, "Cantidad").isdigit() else 0
            direccion_item = get_field_val(reg, "Dirección", "Direccion")
            
            try: monto = float(get_field_val(reg, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip())
            except ValueError: monto = 0.0

            estado_pago = get_field_val(reg, "Estado")
            estado_entrega = get_field_val(reg, "Entrega", "Estado Entrega")
            f_entrega = normalizar_fecha(get_field_val(reg, "Fecha Entrega", "Fecha"))

            item = {"fila": idx, "cliente": cliente, "producto": prod, "cantidad": cant, "monto": monto, "estado": estado_pago, "fecha_entrega": f_entrega, "entrega": estado_entrega, "direccion": direccion_item}

            if estado_pago.lower() == "pendiente":
                pendientes_pago.append(item)
                total_por_cobrar += monto

            if f_entrega and f_entrega >= hoy_str and estado_entrega.lower() != "entregado":
                pendientes_entrega.append(item)

        return jsonify({"status": "exito", "pendientes_pago": pendientes_pago, "pendientes_entrega": pendientes_entrega, "total_por_cobrar": round(total_por_cobrar, 2)}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/marcar_entregado', methods=['POST'])
def marcar_entregado():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        if not num_fila: return jsonify({"status": "error", "mensaje": "Fila no especificada"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        row_data = sheet_ventas.row_values(int(num_fila))

        col_entrega, col_email, col_cliente = 13, -1, -1
        for i, h in enumerate(headers, start=1):
            if "entrega" in h and "fecha" not in h: col_entrega = i
            elif "email" in h or "correo" in h: col_email = i
            elif "cliente" in h: col_cliente = i

        ejecutar_con_reintento(sheet_ventas.update_cell, int(num_fila), col_entrega, "Entregado")

        if col_email > 0 and col_cliente > 0:
            email_cliente = row_data[col_email - 1] if col_email - 1 < len(row_data) else ""
            nombre_cliente = row_data[col_cliente - 1] if col_cliente - 1 < len(row_data) else "Cliente"
            if email_cliente and "@" in email_cliente:
                enviar_email_async(email_cliente, "¡Tu pedido ha sido entregado! 🥐", plantilla_email_entregado(nombre_cliente))

        return jsonify({"status": "exito", "mensaje": "Pedido entregado con éxito"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cambiar_estado_pago', methods=['POST'])
def cambiar_estado_pago():
    try:
        datos = request.json or {}
        num_fila, nuevo_estado = datos.get("fila"), datos.get("estado", "Pagado")
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)

        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        row_data = sheet_ventas.row_values(int(num_fila))

        col_estado, col_email, col_cliente, col_monto = 8, -1, -1, -1
        for i, h in enumerate(headers, start=1):
            if "estado" in h and "entrega" not in h: col_estado = i
            elif "email" in h or "correo" in h: col_email = i
            elif "cliente" in h: col_cliente = i
            elif "monto" in h: col_monto = i

        ejecutar_con_reintento(sheet_ventas.update_cell, int(num_fila), col_estado, nuevo_estado)

        if nuevo_estado.lower() == "pagado" and col_email > 0 and col_cliente > 0:
            email_cliente = row_data[col_email - 1] if col_email - 1 < len(row_data) else ""
            nombre_cliente = row_data[col_cliente - 1] if col_cliente - 1 < len(row_data) else "Cliente"
            monto_total = row_data[col_monto - 1] if col_monto > 0 and col_monto - 1 < len(row_data) else "0"
            if email_cliente and "@" in email_cliente:
                enviar_email_async(email_cliente, "¡Pago recibido con éxito! 💸", plantilla_email_pago_recibido(nombre_cliente, monto_total))

        return jsonify({"status": "exito", "mensaje": "Estado actualizado"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/gastos_e_insumos', methods=['GET'])
def obtener_gastos_e_insumos():
    try:
        sheet_gastos = conectar_sheet("Gastos")
        gastos = get_clean_records(sheet_gastos)
        for idx, g in enumerate(gastos, start=2): g["fila"] = idx
        gastos.reverse()

        sheet_insumos = obtener_o_crear_sheet_insumos()
        insumos = get_clean_records(sheet_insumos)
        return jsonify({"status": "exito", "insumos": insumos, "gastos": gastos[:25]}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/eliminar_gasto', methods=['POST'])
def eliminar_gasto():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        if not num_fila: return jsonify({"status": "error", "mensaje": "Fila no especificada"}), 400

        sheet_gastos = conectar_sheet("Gastos")
        ejecutar_con_reintento(sheet_gastos.delete_rows, int(num_fila))
        return jsonify({"status": "exito", "mensaje": "Gasto eliminado correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/gasto', methods=['POST'])
def registrar_gasto():
    try:
        datos = request.json or {}
        sheet_gastos = conectar_sheet("Gastos")
        registros = get_clean_records(sheet_gastos)
        nuevo_id = f"G-{len(registros) + 1:04d}"
        
        cat, desc = datos.get("categoria", "Otros"), str(datos.get("descripcion", "")).strip()
        cant, unidad, venc = float(datos.get("cantidad", 1)), datos.get("unidad", ""), datos.get("vencimiento", "")
        
        nueva_fila = [nuevo_id, datos.get("fecha"), cat, desc, datos.get("monto"), cant, unidad, venc]
        ejecutar_con_reintento(sheet_gastos.append_row, nueva_fila)

        if cat in ["Materia Prima", "Embalaje"]:
            try:
                sheet_insumos = obtener_o_crear_sheet_insumos()
                insumos_regs = get_clean_records(sheet_insumos)
                fila_encontrada, stock_previo = None, 0.0
                
                for idx, ins in enumerate(insumos_regs, start=2):
                    if get_field_val(ins, "Insumo").lower() == desc.lower():
                        fila_encontrada = idx
                        raw_st = get_field_val(ins, "Stock Actual").replace(",", ".").strip()
                        stock_previo = float(raw_st) if raw_st else 0.0
                        break

                if fila_encontrada:
                    ejecutar_con_reintento(sheet_insumos.update_cell, fila_encontrada, 2, round(stock_previo + cant, 3))
                    if venc: ejecutar_con_reintento(sheet_insumos.update_cell, fila_encontrada, 4, venc)
                else:
                    ejecutar_con_reintento(sheet_insumos.append_row, [desc, cant, unidad or "un", venc])
            except Exception: pass

        return jsonify({"status": "exito", "mensaje": "Gasto registrado", "id": nuevo_id}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock', methods=['GET'])
def obtener_stock():
    try:
        sheet = conectar_sheet("Productos_Stock")
        productos = get_clean_records(sheet)
        return jsonify({"status": "exito", "productos": productos}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/actualizar', methods=['POST'])
def actualizar_stock():
    try:
        datos = request.json or {}
        prod_nombre, nuevo_stock, nuevo_precio = str(datos.get("producto", "")).strip(), datos.get("stock"), datos.get("precio")

        sheet_stock = conectar_sheet("Productos_Stock")
        headers = [str(h).strip().lower() for h in sheet_stock.row_values(1)]
        celda = sheet_stock.find(re.compile(rf"^{re.escape(prod_nombre)}$", re.IGNORECASE))
        if not celda: return jsonify({"status": "error", "mensaje": f"No se encontró el producto {prod_nombre}"}), 404

        fila, col_stock, col_precio = celda.row, 4, 3
        for idx, h in enumerate(headers, start=1):
            if "stock" in h: col_stock = idx
            elif "precio" in h: col_precio = idx

        if nuevo_stock is not None and str(nuevo_stock).isdigit():
            ejecutar_con_reintento(sheet_stock.update_cell, fila, col_stock, int(nuevo_stock))

        if nuevo_precio is not None:
            try:
                precio_val = float(str(nuevo_precio).replace("$", "").replace(",", "").strip())
                ejecutar_con_reintento(sheet_stock.update_cell, fila, col_precio, precio_val)
            except ValueError: pass

        return jsonify({"status": "exito", "mensaje": "Stock y precio actualizados correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/editar_insumo', methods=['POST'])
def editar_insumo():
    try:
        datos = request.json or {}
        insumo_nom = str(datos.get("insumo", "")).strip()
        nuevo_stock, nueva_unidad, nuevo_venc = float(datos.get("stock", 0)), str(datos.get("unidad", "un")).strip(), str(datos.get("vencimiento", "")).strip() or "Sin fecha"

        sheet_insumos = obtener_o_crear_sheet_insumos()
        registros = get_clean_records(sheet_insumos)

        for idx, reg in enumerate(registros, start=2):
            val_ins = get_field_val(reg, "Insumo", "Nombre")
            if val_ins and val_ins.lower() == insumo_nom.lower():
                ejecutar_con_reintento(sheet_insumos.update, f"B{idx}:D{idx}", [[nuevo_stock, nueva_unidad, nuevo_venc]])
                return jsonify({"status": "exito", "mensaje": f"Insumo {insumo_nom} actualizado correctamente"}), 200

        return jsonify({"status": "error", "mensaje": "Insumo no encontrado"}), 404
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/eliminar_insumo', methods=['POST'])
def eliminar_insumo():
    try:
        datos = request.json or {}
        insumo_nom = str(datos.get("insumo", "")).strip()
        sheet_insumos = obtener_o_crear_sheet_insumos()
        registros = get_clean_records(sheet_insumos)

        for idx, reg in enumerate(registros, start=2):
            val_ins = get_field_val(reg, "Insumo", "Nombre")
            if val_ins and val_ins.lower() == insumo_nom.lower():
                ejecutar_con_reintento(sheet_insumos.delete_rows, idx)
                return jsonify({"status": "exito", "mensaje": f"Insumo {insumo_nom} eliminado correctamente"}), 200

        return jsonify({"status": "error", "mensaje": "Insumo no encontrado"}), 404
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/sumar_insumo', methods=['POST'])
def sumar_stock_insumo():
    try:
        datos = request.json or {}
        insumo_nom, cantidad = str(datos.get("insumo", "")).strip(), float(datos.get("cantidad", 0))
        unidad, vencimiento = str(datos.get("unidad", "un")).strip(), str(datos.get("vencimiento", "")).strip() or "Sin fecha"

        if not insumo_nom or cantidad <= 0: return jsonify({"status": "error", "mensaje": "Datos inválidos."}), 400

        sheet_insumos = ejecutar_con_reintento(obtener_o_crear_sheet_insumos)
        registros = ejecutar_con_reintento(get_clean_records, sheet_insumos)

        for idx, reg in enumerate(registros, start=2):
            val_ins = get_field_val(reg, "Insumo", "Nombre")
            if val_ins and val_ins.lower() == insumo_nom.lower():
                raw_st = get_field_val(reg, "Stock Actual").replace(",", ".").strip()
                stock_actual = float(raw_st) if raw_st else 0.0
                nuevo_stock = round(stock_actual + cantidad, 2)
                venc_existente = get_field_val(reg, "Vencimiento Proximo", "Vencimiento Próximo") or "Sin fecha"
                venc_final = vencimiento if (vencimiento and vencimiento != "Sin fecha") else venc_existente

                ejecutar_con_reintento(sheet_insumos.update, f"B{idx}:D{idx}", [[nuevo_stock, unidad, venc_final]])
                return jsonify({"status": "exito", "mensaje": f"Se sumaron {cantidad} {unidad} a {insumo_nom}"}), 200

        ejecutar_con_reintento(sheet_insumos.append_row, [insumo_nom, cantidad, unidad, vencimiento])
        return jsonify({"status": "exito", "mensaje": f"Insumo {insumo_nom} registrado con {cantidad} {unidad}"}), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)