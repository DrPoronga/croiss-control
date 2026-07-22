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

# ==========================================
# CONFIGURACIÓN GENERAL Y FLASK
# ==========================================
app = Flask(__name__)

# Configuración de Sesión Permanente (1 año) y Clave Secreta
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "croiss_super_secreta_2026")
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=365)

# Credenciales de Administrador para el Formulario de Login
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
# HELPER DE PROTECCIÓN Y REINTENTO ANTE 429 (GOOGLE SHEETS)
# ==========================================
def ejecutar_con_reintento(func, *args, **kwargs):
    """Ejecuta cualquier llamado a Google Sheets y, si se agota la cuota (429),
    espera unos segundos antes de volver a intentar."""
    for intento in range(4):
        try:
            return func(*args, **kwargs)
        except APIError as err:
            err_str = str(err)
            if "429" in err_str or (hasattr(err, 'response') and getattr(err.response, 'status_code', None) == 429):
                tiempo_espera = (intento + 1) * 2.5
                print(f"⏳ Cuota Google 429 alcanzada. Reintentando en {tiempo_espera}s (Intento {intento + 1}/4)...", flush=True)
                time.sleep(tiempo_espera)
            else:
                raise err
    raise Exception("Google Sheets está saturado. Espera 30 segundos y vuelve a intentar.")

# ==========================================
# SEGURIDAD, LOGIN Y PROTECCIÓN DE RUTAS
# ==========================================
@app.before_request
def verificar_autenticacion():
    # Permitir acceso libre a estáticos, login y logout
    if request.endpoint in ['login', 'static']:
        return
    # Si no hay sesión iniciada, redirige al login web
    if not session.get('logueado'):
        return redirect(url_for('login'))

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        if request.is_json:
            datos = request.json or {}
            pwd = datos.get("password", "")
        else:
            pwd = request.form.get("password", "")

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
# MOTOR INTELIGENTE DE RECETAS (ESCANDALLO)
# ==========================================
def obtener_receta_producto(producto_nombre):
    p_lower = str(producto_nombre).lower()
    receta = {"harina": 0.05, "manteca": 0.025}
    
    if "dulce" in p_lower or "ddl" in p_lower:
        receta["dulce de leche"] = 0.03
    elif "jamon" in p_lower or "jamón" in p_lower or "queso" in p_lower:
        receta["jamon"] = 0.03
        receta["queso"] = 0.03
    elif "chocolate" in p_lower or "nutella" in p_lower:
        receta["chocolate"] = 0.03
        
    return receta

# ==========================================
# FUNCIONES AUXILIARES & EMAIL
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
        "Medio de Pago", "Email", "Teléfono", "Dirección", "Entrega"
    ]
    try:
        fila_1 = sheet_ventas.row_values(1)
        if not fila_1 or len(fila_1) < len(headers_esperados):
            sheet_ventas.update('A1:M1', [headers_esperados])
    except Exception as e:
        print(f"Aviso verificando encabezados de Ventas: {e}", flush=True)

def normalizar_fecha(fecha_raw):
    if not fecha_raw:
        return ""
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
        if not data or len(data) < 2:
            return []

        raw_headers = data[0]
        headers = []
        for idx, h in enumerate(raw_headers):
            h_str = str(h).strip()
            if h_str and h_str not in [name for _, name in headers]:
                headers.append((idx, h_str))

        rows = data[1:]
        records = []
        for row in rows:
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

    for target in possible_keys:
        target_clean = target.lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u").strip()
        if "entrega" in target_clean:
            for k, val in record.items():
                k_clean = str(k).lower().replace("á","a").replace("é","e").replace("í","i").replace("ó","o").replace("ú","u").strip()
                if "entrega" in k_clean and "fecha" not in k_clean and val:
                    return str(val).strip()

    return ""
    
def enviar_email_async(destinatario, asunto, cuerpo_html):
    def _enviar():
        if not destinatario or "@" not in str(destinatario):
            return

        api_key = BREVO_API_KEY.strip()
        if not api_key:
            return

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
            with urllib.request.urlopen(req, timeout=10) as response:
                pass
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

@app.route('/api/cliente/eliminar', methods=['POST'])
def eliminar_cliente():
    try:
        datos = request.json or {}
        nombre_cliente = str(datos.get("nombre", "")).strip()

        if not nombre_cliente:
            return jsonify({"status": "error", "mensaje": "Nombre de cliente no especificado"}), 400

        sheet_crm = obtener_o_crear_sheet_clientes()
        data_crm = sheet_crm.get_all_values()
        
        if data_crm and len(data_crm) >= 2:
            headers = [str(h).strip().lower() for h in data_crm[0]]
            col_nom = 1
            for i, h in enumerate(headers, start=1):
                if "nombre" in h or "cliente" in h:
                    col_nom = i
                    break
            
            for idx, row in enumerate(data_crm[1:], start=2):
                val_nom = row[col_nom - 1] if col_nom - 1 < len(row) else ""
                if val_nom.strip().lower() == nombre_cliente.lower():
                    ejecutar_con_reintento(sheet_crm.delete_rows, idx)
                    break

        return jsonify({"status": "exito", "mensaje": "Cliente eliminado correctamente del directorio"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500
        
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
        ws = doc.add_worksheet(title="Clientes", rows="100", cols="4")
        ws.append_row(["Nombre", "Email", "Telefono", "Direccion"])
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

# ==========================================
# CÁLCULO ESTÁNDAR DE COSTO POR SABOR Y EMPAQUE
# ==========================================
def calcular_costo_y_empaque_pedido(desc_producto, total_croissants):
    if total_croissants <= 0:
        return {"costo_base": 0.0, "costo_empaque": 0.0, "costo_total": 0.0, "cajas_6": 0, "cajas_3": 0, "papel": 0}
    
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

    cajas_6 = total_croissants // 6
    sobrante = total_croissants % 6
    cajas_3 = 0
    
    if 1 <= sobrante <= 3:
        cajas_3 = 1
    elif sobrante >= 4:
        cajas_6 += 1
        
    papel = cajas_6 + cajas_3
    costo_empaque = (cajas_6 * 36.0) + (cajas_3 * 27.0)
    
    return {
        "costo_base": round(costo_croissants, 2),
        "costo_empaque": round(costo_empaque, 2),
        "costo_total": round(costo_croissants + costo_empaque, 2),
        "cajas_6": cajas_6,
        "cajas_3": cajas_3,
        "papel": papel
    }

# ==========================================
# DESCUENTO AUTOMÁTICO DE EMPAQUE EN STOCK
# ==========================================
def descontar_insumos_por_receta(producto_nombre, cantidad_vendida, total_croissants_pedido=0):
    try:
        if total_croissants_pedido <= 0:
            total_croissants_pedido = cantidad_vendida

        calculo = calcular_costo_y_empaque_pedido(producto_nombre, total_croissants_pedido)
        
        cajas_6_usadas = calculo["cajas_6"]
        cajas_3_usadas = calculo["cajas_3"]
        papel_usado = calculo["papel"]

        sheet_insumos = obtener_o_crear_sheet_insumos()
        registros = get_clean_records(sheet_insumos)
        if not registros:
            return

        modificaciones = {}

        def aplicar_descuento_insumo(palabra_clave, cantidad_a_restar):
            if cantidad_a_restar <= 0: return
            for idx, ins_row in enumerate(registros, start=2):
                nombre_insumo = get_field_val(ins_row, "Insumo").lower()
                if palabra_clave in nombre_insumo:
                    if idx in modificaciones:
                        stock_actual = modificaciones[idx]
                    else:
                        raw_st = get_field_val(ins_row, "Stock Actual").replace(",", ".").strip()
                        stock_actual = float(raw_st) if raw_st else 0.0
                    
                    nuevo_stock = max(0.0, round(stock_actual - cantidad_a_restar, 2))
                    modificaciones[idx] = nuevo_stock
                    break

        aplicar_descuento_insumo("6", cajas_6_usadas)
        aplicar_descuento_insumo("3", cajas_3_usadas)
        aplicar_descuento_insumo("papel", papel_usado)

        for row_idx, n_stock in modificaciones.items():
            ejecutar_con_reintento(sheet_insumos.update_cell, row_idx, 2, n_stock)

    except Exception as e:
        print(f"Aviso descontando empaque/stock: {e}", flush=True)

@app.route('/api/balance', methods=['GET'])
def obtener_balance():
    try:
        mes_filtro = request.args.get('mes', '').strip() or datetime.now().strftime("%Y-%m")

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        sheet_gastos = conectar_sheet("Gastos")

        ventas = get_clean_records(sheet_ventas)
        gastos = get_clean_records(sheet_gastos)

        ingresos_mes = 0.0
        costos_prod_mes = 0.0
        pedidos_count_mes = 0
        total_croiss_mes = 0
        
        total_croiss_historico = 0
        total_pedidos_historico = 0
        total_ingresos_historico = 0.0

        con_jalea_count = 0
        sin_jalea_count = 0
        sabores_dict = {}
        dias_semana_count = {"LUNES": 0, "MARTES": 0, "MIÉRCOLES": 0, "JUEVES": 0, "VIERNES": 0, "SÁBADO": 0, "DOMINGO": 0}
        nombres_dias = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO", "DOMINGO"]

        historico_dict = {}
        clientes_mes_dict = {}
        clientes_historico_dict = {}

        for v in ventas:
            f_norm = normalizar_fecha(get_field_val(v, "Fecha Pedido", "Fecha"))
            if not f_norm or len(f_norm) < 7: continue

            key_mes = f_norm[:7]
            if key_mes not in historico_dict:
                historico_dict[key_mes] = {"ingresos": 0.0, "costos": 0.0, "gastos": 0.0, "pedidos": 0, "croissants": 0}

            raw_monto = get_field_val(v, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip()
            try: monto = float(raw_monto)
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
                    dia_nombre = nombres_dias[dt_v.weekday()]
                    dias_semana_count[dia_nombre] += cant
                except Exception:
                    pass

                if desc_prod:
                    partes = desc_prod.split(",")
                    for item in partes:
                        item_clean = item.strip()
                        if not item_clean: continue
                        
                        tiene_jalea = "(con jalea)" in item_clean.lower()
                        sin_jalea_str = re.sub(r"\(con jalea\)", "", item_clean, flags=re.IGNORECASE).strip()
                        
                        m = re.match(r"^(\d+)x\s+(.+)", sin_jalea_str, re.IGNORECASE)
                        if m:
                            c_item = int(m.group(1))
                            sabor_item = m.group(2).strip()
                        else:
                            c_item = 1
                            sabor_item = sin_jalea_str

                        if sabor_item not in sabores_dict:
                            sabores_dict[sabor_item] = {"cantidad": 0}
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
            cat_clean = cat_nombre.lower().strip()

            if any(cat_ign in cat_clean for cat_ign in CATEGORIAS_IGNORAR):
                continue

            key_mes = f_norm[:7]
            if key_mes not in historico_dict:
                historico_dict[key_mes] = {"ingresos": 0.0, "costos": 0.0, "gastos": 0.0, "pedidos": 0, "croissants": 0}

            raw_monto_g = get_field_val(g, "Monto").replace("$", "").replace(",", ".").strip()
            try: monto_g = float(raw_monto_g)
            except ValueError: monto_g = 0.0

            historico_dict[key_mes]["gastos"] += monto_g

            if f_norm.startswith(mes_filtro):
                gastos_mes += monto_g
                gastos_cat_dict[cat_nombre] = gastos_cat_dict.get(cat_nombre, 0.0) + monto_g

        gastos_por_categoria = []
        for cat_k, cat_v in sorted(gastos_cat_dict.items(), key=lambda x: x[1], reverse=True):
            pct_g = round((cat_v / gastos_mes * 100), 1) if gastos_mes > 0 else 0
            gastos_por_categoria.append({"categoria": cat_k, "monto": round(cat_v, 2), "porcentaje": pct_g})

        ganancia_neta_mes = ingresos_mes - (costos_prod_mes + gastos_mes)
        ticket_promedio = round(ingresos_mes / pedidos_count_mes, 2) if pedidos_count_mes > 0 else 0.0

        mes_actual_str = datetime.now().strftime("%Y-%m")
        es_mes_actual = (mes_filtro == mes_actual_str)
        proy_croiss = total_croiss_mes
        proy_ingresos = ingresos_mes

        if es_mes_actual:
            hoy_dia = datetime.now().day
            year_val, month_val = map(int, mes_filtro.split("-"))
            dias_totales = calendar.monthrange(year_val, month_val)[1]
            if hoy_dia > 0:
                pacing_croiss = total_croiss_mes / hoy_dia
                pacing_ingresos = ingresos_mes / hoy_dia
                proy_croiss = int(round(pacing_croiss * dias_totales))
                proy_ingresos = round(pacing_ingresos * dias_totales, 2)

        top_mes = max(clientes_mes_dict.values(), key=lambda x: x["croissants"]) if clientes_mes_dict else None
        top_historico = max(clientes_historico_dict.values(), key=lambda x: x["croissants"]) if clientes_historico_dict else None

        ranking_sabores = []
        for sab, vals in sabores_dict.items():
            pct = round((vals["cantidad"] / total_croiss_mes * 100), 1) if total_croiss_mes > 0 else 0
            ranking_sabores.append({"sabor": sab, "cantidad": vals["cantidad"], "porcentaje": pct})

        lista_historica = []
        for m_key, vals in sorted(historico_dict.items()):
            g_neta = vals["ingresos"] - (vals["costos"] + vals["gastos"])
            lista_historica.append({
                "mes_key": m_key,
                "ingresos": round(vals["ingresos"], 2),
                "gastos_totales": round(vals["costos"] + vals["gastos"], 2),
                "ganancia_neta": round(g_neta, 2),
                "pedidos": vals["pedidos"],
                "croissants": vals["croissants"]
            })

        return jsonify({
            "status": "exito",
            "mes_filtrado": mes_filtro,
            "ingresos": round(ingresos_mes, 2),
            "costos_produccion": round(costos_prod_mes, 2),
            "gastos_varios": round(gastos_mes, 2),
            "gastos_por_categoria": gastos_por_categoria,
            "ganancia_neta": round(ganancia_neta_mes, 2),
            "ticket_promedio": ticket_promedio,
            "total_croissants_mes": total_croiss_mes,
            "total_croissants_historico": total_croiss_historico,
            "proyeccion": {
                "es_mes_actual": es_mes_actual,
                "croissants_estimados": proy_croiss,
                "ingresos_estimados": proy_ingresos
            },
            "top_clientes": {
                "mes": top_mes,
                "historico": top_historico
            },
            "stats_jalea": {
                "con_jalea": con_jalea_count,
                "sin_jalea": sin_jalea_count,
                "porcentaje": round((con_jalea_count / (con_jalea_count + sin_jalea_count) * 100), 1) if (con_jalea_count + sin_jalea_count) > 0 else 0
            },
            "ranking_sabores": ranking_sabores,
            "dias_semana": dias_semana_count,
            "historico_meses": lista_historica
        }), 200

    except Exception as error:
        print(f"❌ Error en /api/balance: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

# ==========================================
# RUTAS DE LA APLICACIÓN
# ==========================================
@app.route('/')
def inicio():
    return render_template('index.html')

@app.route('/api/stock/congelados', methods=['GET', 'POST'])
def stock_congelados():
    try:
        sheet_stock = conectar_sheet("Productos_Stock")
        
        celda = None
        try:
            celda = sheet_stock.find(re.compile(r"^Croissants Congelados$", re.IGNORECASE))
        except Exception:
            pass

        if not celda:
            ejecutar_con_reintento(sheet_stock.append_row, ["CONG-001", "Croissants Congelados", 0, 0])
            celda = sheet_stock.find(re.compile(r"^Croissants Congelados$", re.IGNORECASE))

        fila = celda.row
        raw_val = sheet_stock.cell(fila, 4).value or "0"
        stock_actual = int(raw_val) if str(raw_val).isdigit() else 0

        if request.method == 'POST':
            datos = request.json or {}
            cantidad_sumar = int(datos.get("cantidad", 0))
            nuevo_stock = max(0, stock_actual + cantidad_sumar)
            ejecutar_con_reintento(sheet_stock.update_cell, fila, 4, nuevo_stock)
            return jsonify({"status": "exito", "stock": nuevo_stock, "mensaje": "Stock congelado actualizado"})

        return jsonify({"status": "exito", "stock": stock_actual}), 200
    except Exception as error:
        print(f"❌ Error en /api/stock/congelados: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

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
            nombre_dia = nombres_dias[fecha_dt.weekday()]
            
            dias_agenda[fecha_str] = {
                "fecha": fecha_str,
                "nombre_dia": f"{nombre_dia} {fecha_dt.strftime('%d/%m')}",
                "pedidos": [],
                "total_croissants": 0
            }
        
        for idx, reg in enumerate(registros, start=2):
            estado_entrega = get_field_val(reg, "Entrega", "Estado Entrega", "Estado de Entrega")
            if estado_entrega and "entregad" in estado_entrega.lower():
                continue

            f_entrega_raw = get_field_val(reg, "Fecha Entrega", "Fecha")
            f_entrega_norm = normalizar_fecha(f_entrega_raw)

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
                    "email": get_field_val(reg, "Email", "Correo")
                })
                dias_agenda[f_entrega_norm]["total_croissants"] += cant
                
        return jsonify({"status": "exito", "agenda": list(dias_agenda.values())}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/editar_pedido', methods=['POST'])
def editar_pedido():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        nuevo_producto = datos.get("producto")
        nueva_cantidad = datos.get("cantidad")

        if not num_fila or nuevo_producto is None:
            return jsonify({"status": "error", "mensaje": "Faltan datos requeridos"}), 400

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

        pendientes_pago = []
        pendientes_entrega = []
        total_por_cobrar = 0.0

        for idx, reg in enumerate(registros, start=2):
            cliente = get_field_val(reg, "Cliente") or "Cliente"
            prod = get_field_val(reg, "Producto")
            cant_str = get_field_val(reg, "Cantidad")
            cant = int(cant_str) if cant_str.isdigit() else 0
            direccion_item = get_field_val(reg, "Dirección", "Direccion")
            
            raw_monto = get_field_val(reg, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip()
            try:
                monto = float(raw_monto)
            except ValueError:
                monto = 0.0

            estado_pago = get_field_val(reg, "Estado")
            estado_entrega = get_field_val(reg, "Entrega", "Estado Entrega")
            f_entrega = normalizar_fecha(get_field_val(reg, "Fecha Entrega", "Fecha"))

            item = {
                "fila": idx,
                "cliente": cliente,
                "producto": prod,
                "cantidad": cant,
                "monto": monto,
                "estado": estado_pago,
                "fecha_entrega": f_entrega,
                "entrega": estado_entrega,
                "direccion": direccion_item
            }

            if estado_pago.lower() == "pendiente":
                pendientes_pago.append(item)
                total_por_cobrar += monto

            if f_entrega and f_entrega >= hoy_str and estado_entrega.lower() != "entregado":
                pendientes_entrega.append(item)

        return jsonify({
            "status": "exito",
            "pendientes_pago": pendientes_pago,
            "pendientes_entrega": pendientes_entrega,
            "total_por_cobrar": round(total_por_cobrar, 2)
        }), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/marcar_entregado', methods=['POST'])
def marcar_entregado():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")

        if not num_fila:
            return jsonify({"status": "error", "mensaje": "Fila no especificada"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)

        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        row_data = sheet_ventas.row_values(int(num_fila))

        col_entrega = 13
        col_email = -1
        col_cliente = -1

        for i, h in enumerate(headers, start=1):
            if "entrega" in h and "fecha" not in h:
                col_entrega = i
            if "email" in h or "correo" in h:
                col_email = i
            if "cliente" in h:
                col_cliente = i

        ejecutar_con_reintento(sheet_ventas.update_cell, int(num_fila), col_entrega, "Entregado")

        if col_email > 0 and col_cliente > 0:
            email_cliente = row_data[col_email - 1] if col_email - 1 < len(row_data) else ""
            nombre_cliente = row_data[col_cliente - 1] if col_cliente - 1 < len(row_data) else "Cliente"
            
            if email_cliente and "@" in email_cliente:
                html = plantilla_email_entregado(nombre_cliente)
                enviar_email_async(email_cliente, "¡Tu pedido ha sido entregado! 🥐", html)

        return jsonify({"status": "exito", "mensaje": "Pedido entregado con éxito"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/eliminar_venta', methods=['POST'])
def eliminar_venta():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")

        if not num_fila:
            return jsonify({"status": "error", "mensaje": "Fila no especificada"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        row_data = sheet_ventas.row_values(int(num_fila))
        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        
        col_cant = 6
        col_cli = 4
        col_email = 10
        col_tel = 11
        col_dir = 12

        for i, h in enumerate(headers, start=1):
            if "cantidad" in h: col_cant = i
            elif "cliente" in h: col_cli = i
            elif "email" in h or "correo" in h: col_email = i
            elif "tel" in h: col_tel = i
            elif "direc" in h: col_dir = i

        if col_cli - 1 < len(row_data):
            cli_nom = row_data[col_cli - 1].strip()
            cli_email = row_data[col_email - 1].strip() if col_email - 1 < len(row_data) else ""
            cli_tel = row_data[col_tel - 1].strip() if col_tel - 1 < len(row_data) else ""
            cli_dir = row_data[col_dir - 1].strip() if col_dir - 1 < len(row_data) else ""
            sincronizar_cliente(cli_nom, cli_email, cli_tel, cli_dir)

        cant_recuperar = 0
        if col_cant - 1 < len(row_data):
            val_cant = str(row_data[col_cant - 1]).strip()
            if val_cant.isdigit():
                cant_recuperar = int(val_cant)

        if cant_recuperar > 0:
            try:
                sheet_stock = conectar_sheet("Productos_Stock")
                celda_cong = sheet_stock.find(re.compile(r"^Croissants Congelados$", re.IGNORECASE))
                if celda_cong:
                    f_cong = celda_cong.row
                    raw_st = sheet_stock.cell(f_cong, 4).value or "0"
                    st_actual_cong = int(raw_st) if str(raw_st).isdigit() else 0
                    
                    nuevo_st_cong = st_actual_cong + cant_recuperar
                    ejecutar_con_reintento(sheet_stock.update_cell, f_cong, 4, nuevo_st_cong)
            except Exception as ec:
                print(f"⚠️ Aviso devolviendo congelados al stock: {ec}", flush=True)

        ejecutar_con_reintento(sheet_ventas.delete_rows, int(num_fila))

        return jsonify({"status": "exito", "mensaje": "Pedido eliminado y stock devuelto correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cliente/editar', methods=['POST'])
def editar_cliente():
    try:
        datos = request.json or {}
        nombre_original = str(datos.get("nombre_original", datos.get("nombre", ""))).strip()
        nuevo_nombre = str(datos.get("nombre", "")).strip() or nombre_original
        nuevo_email = str(datos.get("email", "")).strip()
        nuevo_telefono = str(datos.get("telefono", "")).strip()
        nueva_direccion = str(datos.get("direccion", "")).strip()

        if not nombre_original:
            return jsonify({"status": "error", "mensaje": "Nombre original no especificado"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        data = sheet_ventas.get_all_values()
        if data and len(data) >= 2:
            headers = [str(h).strip().lower() for h in data[0]]
            col_cliente = headers.index("cliente") + 1 if "cliente" in headers else 4
            
            for idx, row in enumerate(data[1:], start=2):
                val_cli = row[col_cliente - 1] if col_cliente - 1 < len(row) else ""
                if val_cli.strip().lower() == nombre_original.lower():
                    ejecutar_con_reintento(sheet_ventas.update, f"D{idx}", [[nuevo_nombre]])
                    ejecutar_con_reintento(sheet_ventas.update, f"J{idx}:L{idx}", [[nuevo_email, nuevo_telefono, nueva_direccion]])

        try:
            sincronizar_cliente(nuevo_nombre, nuevo_email, nuevo_telefono, nueva_direccion)
        except Exception as e:
            print(f"Aviso actualizando cliente en CRM: {e}", flush=True)

        return jsonify({"status": "exito", "mensaje": "Cliente actualizado correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cambiar_estado_pago', methods=['POST'])
def cambiar_estado_pago():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        nuevo_estado = datos.get("estado", "Pagado")

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)

        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        row_data = sheet_ventas.row_values(int(num_fila))

        col_estado = 8
        col_email = -1
        col_cliente = -1
        col_monto = -1

        for i, h in enumerate(headers, start=1):
            if "estado" in h and "entrega" not in h:
                col_estado = i
            if "email" in h or "correo" in h:
                col_email = i
            if "cliente" in h:
                col_cliente = i
            if "monto" in h:
                col_monto = i

        ejecutar_con_reintento(sheet_ventas.update_cell, int(num_fila), col_estado, nuevo_estado)

        if nuevo_estado.lower() == "pagado" and col_email > 0 and col_cliente > 0:
            email_cliente = row_data[col_email - 1] if col_email - 1 < len(row_data) else ""
            nombre_cliente = row_data[col_cliente - 1] if col_cliente - 1 < len(row_data) else "Cliente"
            monto_total = row_data[col_monto - 1] if col_monto > 0 and col_monto - 1 < len(row_data) else "0"
            
            if email_cliente and "@" in email_cliente:
                html = plantilla_email_pago_recibido(nombre_cliente, monto_total)
                enviar_email_async(email_cliente, "¡Pago recibido con éxito! 💸", html)

        return jsonify({"status": "exito", "mensaje": "Estado actualizado"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/gastos_e_insumos', methods=['GET'])
def obtener_gastos_e_insumos():
    try:
        sheet_gastos = conectar_sheet("Gastos")
        gastos = get_clean_records(sheet_gastos)
        
        for idx, g in enumerate(gastos, start=2):
            g["fila"] = idx

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

        if not num_fila:
            return jsonify({"status": "error", "mensaje": "Fila no especificada"}), 400

        sheet_gastos = conectar_sheet("Gastos")
        ejecutar_con_reintento(sheet_gastos.delete_rows, int(num_fila))

        return jsonify({"status": "exito", "mensaje": "Gasto eliminado correctamente"}), 200
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
        prod_nombre = str(datos.get("producto", "")).strip()
        nuevo_stock = datos.get("stock")
        nuevo_precio = datos.get("precio")

        sheet_stock = conectar_sheet("Productos_Stock")
        headers = [str(h).strip().lower() for h in sheet_stock.row_values(1)]
        celda = sheet_stock.find(re.compile(rf"^{re.escape(prod_nombre)}$", re.IGNORECASE))
        
        if not celda:
            return jsonify({"status": "error", "mensaje": f"No se encontró el producto {prod_nombre}"}), 404

        fila = celda.row
        col_stock, col_precio = 4, 3

        for idx, h in enumerate(headers, start=1):
            if "stock" in h: col_stock = idx
            elif "precio" in h: col_precio = idx

        if nuevo_stock is not None and str(nuevo_stock).isdigit():
            ejecutar_con_reintento(sheet_stock.update_cell, fila, col_stock, int(nuevo_stock))

        if nuevo_precio is not None:
            try:
                precio_val = float(str(nuevo_precio).replace("$", "").replace(",", "").strip())
                ejecutar_con_reintento(sheet_stock.update_cell, fila, col_precio, precio_val)
            except ValueError:
                pass

        return jsonify({"status": "exito", "mensaje": "Stock y precio actualizados correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/venta', methods=['POST'])
def registrar_venta():
    try:
        datos = request.json or {}
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        sheet_stock = conectar_sheet("Productos_Stock")
        
        registros = get_clean_records(sheet_ventas)
        nuevo_id = f"V-{len(registros) + 1:04d}"
        
        items = datos.get("items", [])
        resumen_productos = []
        total_unidades = sum(int(item.get("cantidad", 1)) for item in items)
        
        for idx_item, item in enumerate(items):
            prod_nombre = item.get("producto")
            cant = int(item.get("cantidad", 1))
            
            tot_pedido_flag = total_unidades if idx_item == 0 else 0
            descontar_insumos_por_receta(prod_nombre, cant, tot_pedido_flag)
            
            jalea_str = " (Con Jalea)" if item.get("con_jalea") else ""
            resumen_productos.append(f"{cant}x {prod_nombre}{jalea_str}")

        if total_unidades > 0:
            try:
                celda_cong = sheet_stock.find(re.compile(r"^Croissants Congelados$", re.IGNORECASE))
                if celda_cong:
                    f_cong = celda_cong.row
                    raw_st = sheet_stock.cell(f_cong, 4).value or "0"
                    st_actual_cong = int(raw_st) if str(raw_st).isdigit() else 0
                    nuevo_st_cong = max(0, st_actual_cong - total_unidades)
                    ejecutar_con_reintento(sheet_stock.update_cell, f_cong, 4, nuevo_st_cong)
            except Exception as ec:
                print(f"Aviso descontando congelados: {ec}", flush=True)

        descripcion_final = ", ".join(resumen_productos)
        cliente_nombre = datos.get("cliente", "Consumidor Final")
        email_cliente = str(datos.get("email", "")).strip()
        telefono_cliente = str(datos.get("telefono", "")).strip()
        direccion_cliente = str(datos.get("direccion", "")).strip()
        fecha_entrega = datos.get("fecha_entrega", datos.get("fecha"))
        monto_total = datos.get("monto_total", 0)
        estado_pedido = datos.get("estado", "Pendiente")
        
        nueva_fila = [
            nuevo_id,
            datos.get("fecha"),
            fecha_entrega,
            cliente_nombre,
            descripcion_final,
            total_unidades,
            monto_total,
            estado_pedido,
            datos.get("medio_pago", "-"),
            email_cliente,
            telefono_cliente,
            direccion_cliente,
            "Pendiente"
        ]
        ejecutar_con_reintento(sheet_ventas.append_row, nueva_fila)

        if email_cliente:
            try:
                html = plantilla_email_confirmacion(cliente_nombre, descripcion_final, fecha_entrega, monto_total, estado_pedido)
                enviar_email_async(email_cliente, "🥐 ¡Tu pedido en CROISS está confirmado!", html)
            except Exception:
                pass

        try:
            sincronizar_cliente(cliente_nombre, email_cliente, telefono_cliente, direccion_cliente)
        except Exception:
            pass

        return jsonify({"status": "exito", "mensaje": "Pedido registrado correctamente", "id": nuevo_id}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

def sincronizar_cliente(nombre, email, telefono, direccion):
    if not nombre or nombre.lower() == "consumidor final": return
    
    if "@" in str(nombre) and "@" not in str(email):
        nombre, email = email, nombre

    try:
        sheet = obtener_o_crear_sheet_clientes()
        registros = get_clean_records(sheet)
        
        for idx, reg in enumerate(registros, start=2):
            val_nom = get_field_val(reg, "Nombre", "Cliente", "Nombre Cliente")

            if val_nom and val_nom.lower() == nombre.lower():
                ejecutar_con_reintento(sheet.update, f"A{idx}:D{idx}", [[nombre, email, telefono, direccion]])
                return
        
        ejecutar_con_reintento(sheet.append_row, [nombre, email, telefono, direccion])
    except Exception as e:
        print(f"Aviso sincronizando cliente: {e}", flush=True)     

@app.route('/api/clientes', methods=['GET'])
def obtener_clientes():
    try:
        mes_filtro = request.args.get('mes', '').strip() or datetime.now().strftime("%Y-%m")
        clientes_historico, clientes_mes = {}, {}

        sheet_crm = obtener_o_crear_sheet_clientes()
        crm_records = get_clean_records(sheet_crm)
        
        # 1. Procesar directorio maestro CRM (Lectura pura en memoria RAM)
        for c in crm_records:
            nom = get_field_val(c, "Nombre", "Cliente", "Nombre Cliente").strip()
            email = get_field_val(c, "Email", "Correo").strip()
            tel = get_field_val(c, "Telefono", "Teléfono", "Tel").strip()
            direccion = get_field_val(c, "Direccion", "Dirección").strip()

            if "@" in nom and "@" not in email:
                nom, email = email, nom

            if not nom or nom.lower() == "consumidor final": 
                continue
                
            key_norm = nom.lower()

            clientes_historico[key_norm] = {
                "nombre": nom,
                "email": email,
                "telefono": tel,
                "direccion": direccion,
                "total_gastado": 0.0,
                "total_croissants": 0,
                "total_pedidos": 0,
                "historial": []
            }

        # 2. Cruzar con historial de Ventas
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        ventas = get_clean_records(sheet_ventas)

        for idx, v in enumerate(ventas, start=2):
            cliente_nombre = get_field_val(v, "Cliente").strip() or "Consumidor Final"
            if not cliente_nombre or cliente_nombre.lower() == "consumidor final": 
                continue

            email_c = get_field_val(v, "Email", "Correo").strip()
            tel_c = get_field_val(v, "Teléfono", "Telefono", "Tel").strip()
            dir_c = get_field_val(v, "Dirección", "Direccion").strip()
            fecha_norm = normalizar_fecha(get_field_val(v, "Fecha Pedido", "Fecha", "Fecha Entrega"))
            
            try:
                monto = float(get_field_val(v, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip())
            except ValueError:
                monto = 0.0

            raw_cant = get_field_val(v, "Cantidad")
            cant = int(raw_cant) if raw_cant.isdigit() else 0
            key_norm = cliente_nombre.lower()

            estado_pago = get_field_val(v, "Estado") or "Pendiente"
            raw_entrega = get_field_val(v, "Entrega", "Estado Entrega", "Estado de Entrega")
            estado_entrega = raw_entrega if raw_entrega else "Sin Registrar"

            pedido_item = {
                "fila": idx,
                "id": get_field_val(v, "ID Venta", "ID"),
                "fecha": fecha_norm,
                "producto": get_field_val(v, "Producto"),
                "cantidad": cant,
                "monto": monto,
                "estado_pago": estado_pago,
                "estado_entrega": estado_entrega,
                "direccion": dir_c
            }

            if key_norm not in clientes_historico:
                clientes_historico[key_norm] = {
                    "nombre": cliente_nombre,
                    "email": email_c,
                    "telefono": tel_c,
                    "direccion": dir_c,
                    "total_gastado": 0.0,
                    "total_croissants": 0,
                    "total_pedidos": 0,
                    "historial": []
                }
            else:
                if email_c and not clientes_historico[key_norm]["email"]:
                    clientes_historico[key_norm]["email"] = email_c
                if tel_c and not clientes_historico[key_norm]["telefono"]:
                    clientes_historico[key_norm]["telefono"] = tel_c
                if dir_c and not clientes_historico[key_norm]["direccion"]:
                    clientes_historico[key_norm]["direccion"] = dir_c

            clientes_historico[key_norm]["total_gastado"] += monto
            clientes_historico[key_norm]["total_croissants"] += cant
            clientes_historico[key_norm]["total_pedidos"] += 1
            clientes_historico[key_norm]["historial"].append(pedido_item)

            if fecha_norm and fecha_norm.startswith(mes_filtro):
                if key_norm not in clientes_mes:
                    clientes_mes[key_norm] = {
                        "nombre": cliente_nombre,
                        "email": email_c,
                        "telefono": tel_c,
                        "direccion": dir_c,
                        "total_gastado": 0.0,
                        "total_croissants": 0,
                        "total_pedidos": 0,
                        "historial": []
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
        for c in lista_mes: 
            c["total_gastado"] = round(c["total_gastado"], 2)

        top_cliente_mes = lista_mes[0] if lista_mes else None

        return jsonify({
            "status": "exito",
            "mes_filtrado": mes_filtro,
            "clientes_todos": lista_historico,
            "ranking_mes": lista_mes,
            "top_cliente_mes": top_cliente_mes
        }), 200

    except Exception as error:
        print(f"❌ Error en /api/clientes: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500
        
@app.route('/api/gasto', methods=['POST'])
def registrar_gasto():
    try:
        datos = request.json or {}
        sheet_gastos = conectar_sheet("Gastos")
        
        registros = get_clean_records(sheet_gastos)
        nuevo_id = f"G-{len(registros) + 1:04d}"
        
        cat = datos.get("categoria", "Otros")
        desc = str(datos.get("descripcion", "")).strip()
        cant = float(datos.get("cantidad", 1))
        unidad = datos.get("unidad", "")
        venc = datos.get("vencimiento", "")
        
        nueva_fila = [
            nuevo_id,
            datos.get("fecha"),
            cat,
            desc,
            datos.get("monto"),
            cant,
            unidad,
            venc
        ]
        ejecutar_con_reintento(sheet_gastos.append_row, nueva_fila)

        if cat in ["Materia Prima", "Embalaje"]:
            try:
                sheet_insumos = obtener_o_crear_sheet_insumos()
                insumos_regs = get_clean_records(sheet_insumos)
                
                fila_encontrada = None
                stock_previo = 0.0
                
                for idx, ins in enumerate(insumos_regs, start=2):
                    ins_nombre = get_field_val(ins, "Insumo").lower()
                    if ins_nombre == desc.lower():
                        fila_encontrada = idx
                        raw_st = get_field_val(ins, "Stock Actual").replace(",", ".").strip()
                        stock_previo = float(raw_st) if raw_st else 0.0
                        break

                if fila_encontrada:
                    nuevo_stock = round(stock_previo + cant, 3)
                    ejecutar_con_reintento(sheet_insumos.update_cell, fila_encontrada, 2, nuevo_stock)
                    if venc:
                        ejecutar_con_reintento(sheet_insumos.update_cell, fila_encontrada, 4, venc)
                else:
                    ejecutar_con_reintento(sheet_insumos.append_row, [desc, cant, unidad or "un", venc])
            except Exception:
                pass

        return jsonify({"status": "exito", "mensaje": "Gasto registrado", "id": nuevo_id}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

# ==========================================
# RUTA SUMAR STOCK (PROTEGIDA CONTRA ERRORES 429)
# ==========================================
@app.route('/api/stock/sumar_insumo', methods=['POST'])
def sumar_stock_insumo():
    try:
        datos = request.json or {}
        insumo_nom = str(datos.get("insumo", "")).strip()
        cantidad = float(datos.get("cantidad", 0))
        unidad = str(datos.get("unidad", "un")).strip()
        vencimiento = str(datos.get("vencimiento", "")).strip() or "Sin fecha"

        if not insumo_nom or cantidad <= 0:
            return jsonify({"status": "error", "mensaje": "Ingresa un insumo y cantidad válida."}), 400

        sheet_insumos = ejecutar_con_reintento(obtener_o_crear_sheet_insumos)
        registros = ejecutar_con_reintento(get_clean_records, sheet_insumos)

        encontrado = False
        for idx, reg in enumerate(registros, start=2):
            val_ins = get_field_val(reg, "Insumo", "Nombre")
            if val_ins and val_ins.lower() == insumo_nom.lower():
                encontrado = True
                raw_st = get_field_val(reg, "Stock Actual").replace(",", ".").strip()
                stock_actual = float(raw_st) if raw_st else 0.0
                nuevo_stock = round(stock_actual + cantidad, 2)
                
                venc_existente = get_field_val(reg, "Vencimiento Proximo", "Vencimiento Próximo") or "Sin fecha"
                venc_final = vencimiento if (vencimiento and vencimiento != "Sin fecha") else venc_existente

                ejecutar_con_reintento(
                    sheet_insumos.update,
                    f"B{idx}:D{idx}",
                    [[nuevo_stock, unidad, venc_final]]
                )
                return jsonify({"status": "exito", "mensaje": f"Se sumaron {cantidad} {unidad} a {insumo_nom}"}), 200

        if not encontrado:
            ejecutar_con_reintento(
                sheet_insumos.append_row,
                [insumo_nom, cantidad, unidad, vencimiento]
            )
            return jsonify({"status": "exito", "mensaje": f"Insumo {insumo_nom} registrado con {cantidad} {unidad}"}), 200

    except Exception as error:
        print(f"❌ Error en sumar_stock_insumo: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": f"Saturación temporal: {str(error)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)