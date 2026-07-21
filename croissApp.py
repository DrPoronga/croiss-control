import os
import re
import json
import socket
import urllib.request
import threading
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request
import gspread
from google.oauth2.service_account import Credentials

# ==========================================
# CONFIGURACIÓN GENERAL Y FLASK
# ==========================================
app = Flask(__name__)

# Configuración de Brevo API por HTTP
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")
EMAIL_EMISOR = os.environ.get("EMAIL_EMISOR", "pedidos@croissuy.com")

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

SPREADSHEET_ID = "1-HZ19zxOZWJXizFSrhb5m6OKJJWQ_207SuRqdLVNWWE"

# ==========================================
# MOTOR INTELIGENTE DE RECETAS (ESCANDALLO)
# ==========================================
def obtener_receta_producto(producto_nombre):
    """Genera la receta aproximada en Kilos/Litros según el nombre del producto"""
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
    """Verifica que existan encabezados en Fila 1"""
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
    """Lee la planilla convirtiendo cada fila en un diccionario limpio"""
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
    """Busca un valor en el registro de forma flexible frente a tildes o mayúsculas"""
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
        if not destinatario or "@" not in str(destinatario):
            print(f"⚠️ [EMAIL] No se envió correo: dirección inválida ('{destinatario}')", flush=True)
            return

        api_key = BREVO_API_KEY.strip()
        if not api_key:
            print("❌ [EMAIL] Error: La variable BREVO_API_KEY no está configurada en Render.", flush=True)
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
            req = urllib.request.Request(
                url, 
                data=json.dumps(payload).encode("utf-8"), 
                headers=headers, 
                method="POST"
            )
            with urllib.request.urlopen(req, timeout=10) as response:
                if response.status in [200, 201]:
                    print(f"📧 [EMAIL] ¡Correo enviado con éxito a {destinatario} vía Brevo API!", flush=True)
                else:
                    print(f"⚠️ [EMAIL] Brevo devolvió estado HTTP: {response.status}", flush=True)
        except Exception as e:
            print(f"❌ [EMAIL] Error enviando correo vía Brevo API a {destinatario}: {e}", flush=True)

    threading.Thread(target=_enviar).start()

# --- PLANTILLAS VISUALES DE EMAIL ---

def plantilla_email_confirmacion(cliente, items_str, fecha_entrega, total, estado_pago="Pendiente"):
    badge_pago = "Pagado" if estado_pago.lower() == "pagado" else "Pendiente de Pago"
    return f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #FAF9F8; padding: 30px 10px; color: #2D1E18;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 28px; border: 1px solid #EFEAE6; box-shadow: 0 10px 25px rgba(0,0,0,0.04);">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #C86D28; font-size: 28px; margin: 0; font-weight: 800; letter-spacing: 1.5px;">CROISS</h1>
          <p style="font-size: 12px; color: #7A6B63; margin-top: 4px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Artesanos del Croissant</p>
        </div>
        
        <h2 style="font-size: 18px; color: #2D1E18; margin-top: 0;">¡Hola, {cliente}! ✨</h2>
        <p style="font-size: 14px; color: #475569; line-height: 1.5;">Recibimos tu pedido correctamente y ya está programado en nuestra agenda de producción.</p>
        
        <div style="background: #FAF0EB; border: 1px solid #F7DFC8; padding: 18px; border-radius: 16px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-size: 11px; font-weight: 800; color: #C86D28; text-transform: uppercase; letter-spacing: 0.5px;">Resumen del Pedido</p>
          <p style="margin: 0; font-size: 15px; font-weight: 700; color: #2D1E18;">📦 {items_str}</p>
          <hr style="border: none; border-top: 1px dashed #EFEAE6; margin: 12px 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b;">📅 Fecha de Entrega: <strong style="color: #2D1E18;">{fecha_entrega}</strong></p>
          <p style="margin: 0 0 6px 0; font-size: 13px; color: #64748b;">💳 Estado del Pago: <strong style="color: #2D1E18;">{badge_pago}</strong></p>
          <p style="margin: 10px 0 0 0; font-size: 16px; font-weight: 800; color: #C86D28;">Total: ${total}</p>
        </div>
        
        <p style="font-size: 13px; color: #7A6B63; text-align: center; margin-top: 25px;">
          ¡Muchas gracias por elegirnos! Nos vemos pronto. ❤️
        </p>
      </div>
    </div>
    """

def plantilla_email_pago_recibido(cliente, monto):
    return f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #FAF9F8; padding: 30px 10px; color: #2D1E18;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 28px; border: 1px solid #EFEAE6; box-shadow: 0 10px 25px rgba(0,0,0,0.04);">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #C86D28; font-size: 28px; margin: 0; font-weight: 800; letter-spacing: 1.5px;">CROISS</h1>
          <p style="font-size: 12px; color: #7A6B63; margin-top: 4px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Artesanos del Croissant</p>
        </div>
        
        <div style="text-align: center;">
            <h2 style="font-size: 20px; color: #2D1E18; margin: 10px 0 4px 0;">¡Pago Recibido!</h2>
            <p style="font-size: 14px; color: #475569;">Hola <strong>{cliente}</strong>, registramos con éxito tu pago.</p>
        </div>
        
        <div style="background: #FAF0EB; border: 1px solid #F7DFC8; padding: 18px; border-radius: 16px; margin: 20px 0; text-align: center;">
          <small style="font-size: 11px; font-weight: 800; color: #C86D28; text-transform: uppercase;">Monto Acreditado</small><br>
          <strong style="font-size: 24px; color: #2D1E18; margin-top: 4px; display: block;">${monto}</strong>
        </div>
        
        <p style="font-size: 13px; color: #7A6B63; text-align: center; margin-top: 25px;">
          ¡Tu pedido ya está al día! Muchas gracias. 🥐
        </p>
      </div>
    </div>
    """

def plantilla_email_entregado(cliente, link_google_review="https://share.google/dTCn5wDuysp01wARR"):
    return f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #FAF9F8; padding: 30px 10px; color: #2D1E18;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 24px; padding: 28px; border: 1px solid #EFEAE6; box-shadow: 0 10px 25px rgba(0,0,0,0.04);">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #C86D28; font-size: 28px; margin: 0; font-weight: 800; letter-spacing: 1.5px;">CROISS</h1>
          <p style="font-size: 12px; color: #7A6B63; margin-top: 4px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Artesanos del Croissant</p>
        </div>
        
        <div style="text-align: center;">
            <h2 style="font-size: 20px; color: #2D1E18; margin: 10px 0 4px 0;">¡Pedido Entregado! 🥐✨</h2>
            <p style="font-size: 14px; color: #475569; line-height: 1.5;">Hola <strong>{cliente}</strong>, tu pedido ha sido entregado. Esperamos que disfrutes cada bocado.</p>
        </div>
        
        <div style="background: #FAF0EB; border: 1px solid #F7DFC8; padding: 20px; border-radius: 16px; margin: 25px 0; text-align: center;">
          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 700; color: #2D1E18;">¿Qué te pareció la experiencia?</p>
          <p style="margin: 0 0 16px 0; font-size: 13px; color: #64748b;">Tu opinión nos ayuda un montón a seguir creciendo. Dejanos tu reseña en Google:</p>
          <a href="{link_google_review}" target="_blank" style="display: inline-block; background: linear-gradient(135deg, #C86D28, #9A4D15); color: #ffffff; text-decoration: none; font-weight: 700; font-size: 13px; padding: 12px 22px; border-radius: 14px; box-shadow: 0 4px 12px rgba(200, 109, 40, 0.25);">
            ⭐ Dejar reseña en Google
          </a>
        </div>
        
        <p style="font-size: 13px; color: #7A6B63; text-align: center; margin-top: 25px;">
          ¡Gracias por ser parte de CROISS! ❤️
        </p>
      </div>
    </div>
    """

# ==========================================
# RUTAS DE LA APLICACIÓN (ENDPOINTS)
# ==========================================
@app.route('/')
def inicio():
    return render_template('index.html')

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
        
        for reg in registros:
            f_entrega_raw = get_field_val(reg, "Fecha Entrega", "Fecha")
            f_entrega_norm = normalizar_fecha(f_entrega_raw)

            if f_entrega_norm in dias_agenda:
                cant_str = get_field_val(reg, "Cantidad")
                cant = int(cant_str) if cant_str.isdigit() else 0
                dias_agenda[f_entrega_norm]["pedidos"].append({
                    "id": get_field_val(reg, "ID Venta", "ID"),
                    "cliente": get_field_val(reg, "Cliente"),
                    "descripcion": get_field_val(reg, "Producto"),
                    "cantidad": cant,
                    "estado": get_field_val(reg, "Estado"),
                    "direccion": get_field_val(reg, "Dirección", "Direccion")
                })
                dias_agenda[f_entrega_norm]["total_croissants"] += cant
                
        return jsonify({"status": "exito", "agenda": list(dias_agenda.values())}), 200
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
            return jsonify({"status": "error", "mensaje": "Número de fila no especificado"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)

        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        col_entrega = 13  # Por defecto Columna M (13)

        for i, h in enumerate(headers, start=1):
            if "entrega" in h and "fecha" not in h:
                col_entrega = i

        sheet_ventas.update_cell(int(num_fila), col_entrega, "Entregado")

        registros = get_clean_records(sheet_ventas)
        idx_registro = int(num_fila) - 2

        if 0 <= idx_registro < len(registros):
            reg = registros[idx_registro]
            email_cliente = get_field_val(reg, "Email", "Correo")
            cliente_nombre = get_field_val(reg, "Cliente") or "Cliente"

            print(f"🚚 Marca de Entrega Fila {num_fila} -> Cliente: '{cliente_nombre}' | Email: '{email_cliente}'", flush=True)

            if email_cliente and "@" in email_cliente:
                link_review = "https://share.google/dTCn5wDuysp01wARR"
                html = plantilla_email_entregado(cliente_nombre, link_review)
                enviar_email_async(email_cliente, "✨ ¡Tu pedido de CROISS fue entregado! Dejanos tu reseña", html)

        return jsonify({"status": "exito", "mensaje": "Pedido marcado como entregado con éxito"}), 200
    except Exception as error:
        print(f"❌ Error en /api/marcar_entregado: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/eliminar_venta', methods=['POST'])
def eliminar_venta():
    """Elimina permanentemente una orden/fila de la pestaña Ventas"""
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")

        if not num_fila:
            return jsonify({"status": "error", "mensaje": "Número de fila no especificado"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        sheet_ventas.delete_rows(int(num_fila))

        print(f"🗑️ [PEDIDO ELIMINADO] Se borró la fila {num_fila} de Google Sheets", flush=True)
        return jsonify({"status": "exito", "mensaje": "Pedido eliminado correctamente"}), 200
    except Exception as error:
        print(f"❌ Error en /api/eliminar_venta: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cliente/editar', methods=['POST'])
def editar_cliente():
    """Actualiza email, teléfono y dirección de un cliente en todas sus órdenes"""
    try:
        datos = request.json or {}
        nombre_cliente = str(datos.get("nombre", "")).strip()
        nuevo_email = str(datos.get("email", "")).strip()
        nuevo_telefono = str(datos.get("telefono", "")).strip()
        nueva_direccion = str(datos.get("direccion", "")).strip()

        if not nombre_cliente:
            return jsonify({"status": "error", "mensaje": "Nombre de cliente no especificado"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        data = sheet_ventas.get_all_values()
        if not data or len(data) < 2:
            return jsonify({"status": "exito", "mensaje": "No hay filas para actualizar"}), 200

        headers = [str(h).strip().lower() for h in data[0]]
        
        col_cliente = headers.index("cliente") + 1 if "cliente" in headers else 4
        col_email = headers.index("email") + 1 if "email" in headers else 10
        col_tel = next((i + 1 for i, h in enumerate(headers) if "tel" in h), 11)
        col_dir = next((i + 1 for i, h in enumerate(headers) if "direc" in h), 12)

        filas_modificadas = 0
        for idx, row in enumerate(data[1:], start=2):
            val_cli = row[col_cliente - 1] if col_cliente - 1 < len(row) else ""
            if val_cli.strip().lower() == nombre_cliente.lower():
                sheet_ventas.update_cell(idx, col_email, nuevo_email)
                sheet_ventas.update_cell(idx, col_tel, nuevo_telefono)
                sheet_ventas.update_cell(idx, col_dir, nueva_direccion)
                filas_modificadas += 1

        print(f"✏️ [CLIENTE EDITADO] '{nombre_cliente}' actualizado en {filas_modificadas} fila(s).", flush=True)
        return jsonify({"status": "exito", "mensaje": f"Cliente actualizado en {filas_modificadas} registro(s)"}), 200
    except Exception as error:
        print(f"❌ Error en /api/cliente/editar: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cambiar_estado_pago', methods=['POST'])
def cambiar_estado_pago():
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        nuevo_estado = datos.get("estado", "Pagado")

        if not num_fila:
            return jsonify({"status": "error", "mensaje": "Número de fila no especificado"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)

        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        col_estado = 8

        for i, h in enumerate(headers, start=1):
            if "estado" in h:
                col_estado = i

        sheet_ventas.update_cell(int(num_fila), col_estado, nuevo_estado)

        if nuevo_estado.lower() == "pagado":
            registros = get_clean_records(sheet_ventas)
            idx_registro = int(num_fila) - 2

            if 0 <= idx_registro < len(registros):
                reg = registros[idx_registro]
                email_cliente = get_field_val(reg, "Email", "Correo")
                cliente_nombre = get_field_val(reg, "Cliente") or "Cliente"
                monto = get_field_val(reg, "Monto Total", "Monto") or "0"

                if email_cliente and "@" in email_cliente:
                    html = plantilla_email_pago_recibido(cliente_nombre, monto)
                    enviar_email_async(email_cliente, "✨ ¡Pago Recibido! - CROISS", html)

        return jsonify({"status": "exito", "mensaje": "Estado actualizado correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

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

@app.route('/api/gastos_e_insumos', methods=['GET'])
def obtener_gastos_e_insumos():
    try:
        gastos = []
        try:
            sheet_gastos = conectar_sheet("Gastos")
            gastos = get_clean_records(sheet_gastos)
            gastos.reverse()
        except Exception as eg:
            print(f"Aviso leyendo Gastos: {eg}", flush=True)

        insumos = []
        try:
            sheet_insumos = obtener_o_crear_sheet_insumos()
            insumos = get_clean_records(sheet_insumos)
        except Exception as ei:
            print(f"Aviso leyendo Insumos: {ei}", flush=True)

        return jsonify({
            "status": "exito",
            "insumos": insumos,
            "gastos": gastos[:15]
        }), 200
    except Exception as error:
        print(f"❌ Error en /api/gastos_e_insumos: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/balance', methods=['GET'])
def obtener_balance():
    try:
        mes_filtro = request.args.get('mes', '').strip() or datetime.now().strftime("%Y-%m")

        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        sheet_gastos = conectar_sheet("Gastos")
        sheet_stock = conectar_sheet("Productos_Stock")

        ventas = get_clean_records(sheet_ventas)
        gastos = get_clean_records(sheet_gastos)
        stock = get_clean_records(sheet_stock)

        costos_map = {}
        for s in stock:
            prod_name = get_field_val(s, "Nombre", "Producto").lower()
            raw_costo = get_field_val(s, "Costo Producción", "Costo Produccion", "Costo").replace("$", "").replace(",", ".").strip()
            try:
                costos_map[prod_name] = float(raw_costo)
            except ValueError:
                costos_map[prod_name] = 0.0

        ingresos_mes = 0.0
        costos_prod_mes = 0.0
        pedidos_count_mes = 0
        historico_dict = {}

        for v in ventas:
            f_norm = normalizar_fecha(get_field_val(v, "Fecha Pedido", "Fecha"))
            if not f_norm or len(f_norm) < 7: continue

            key_mes = f_norm[:7]
            if key_mes not in historico_dict:
                historico_dict[key_mes] = {"ingresos": 0.0, "costos": 0.0, "gastos": 0.0, "pedidos": 0}

            raw_monto = get_field_val(v, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip()
            try:
                monto = float(raw_monto)
            except ValueError:
                monto = 0.0

            raw_cant = get_field_val(v, "Cantidad")
            cant = int(raw_cant) if raw_cant.isdigit() else 0

            prod_name = get_field_val(v, "Producto").lower()
            costo_unit = costos_map.get(prod_name, 0.0)
            costo_total_item = costo_unit * cant

            historico_dict[key_mes]["ingresos"] += monto
            historico_dict[key_mes]["costos"] += costo_total_item
            historico_dict[key_mes]["pedidos"] += 1

            if f_norm.startswith(mes_filtro):
                ingresos_mes += monto
                costos_prod_mes += costo_total_item
                pedidos_count_mes += 1

        gastos_mes = 0.0
        for g in gastos:
            f_norm = normalizar_fecha(get_field_val(g, "Fecha"))
            if not f_norm or len(f_norm) < 7: continue

            key_mes = f_norm[:7]
            if key_mes not in historico_dict:
                historico_dict[key_mes] = {"ingresos": 0.0, "costos": 0.0, "gastos": 0.0, "pedidos": 0}

            raw_monto_g = get_field_val(g, "Monto").replace("$", "").replace(",", ".").strip()
            try:
                monto_g = float(raw_monto_g)
            except ValueError:
                monto_g = 0.0

            historico_dict[key_mes]["gastos"] += monto_g

            if f_norm.startswith(mes_filtro):
                gastos_mes += monto_g

        ganancia_neta_mes = ingresos_mes - (costos_prod_mes + gastos_mes)
        ticket_promedio = round(ingresos_mes / pedidos_count_mes, 2) if pedidos_count_mes > 0 else 0.0

        lista_historica = []
        for m_key, vals in sorted(historico_dict.items(), reverse=True):
            g_neta = vals["ingresos"] - (vals["costos"] + vals["gastos"])
            lista_historica.append({
                "mes_key": m_key,
                "ingresos": round(vals["ingresos"], 2),
                "gastos_totales": round(vals["costos"] + vals["gastos"], 2),
                "ganancia_neta": round(g_neta, 2),
                "pedidos": vals["pedidos"]
            })

        return jsonify({
            "status": "exito",
            "mes_filtrado": mes_filtro,
            "ingresos": round(ingresos_mes, 2),
            "costos_produccion": round(costos_prod_mes, 2),
            "gastos_varios": round(gastos_mes, 2),
            "ganancia_neta": round(ganancia_neta_mes, 2),
            "ticket_promedio": ticket_promedio,
            "historico_meses": lista_historica
        }), 200

    except Exception as error:
        print(f"❌ Error en /api/balance: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock', methods=['GET'])
def obtener_stock():
    try:
        sheet = conectar_sheet("Productos_Stock")
        productos = get_clean_records(sheet)
        return jsonify({"status": "exito", "productos": productos}), 200
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
            
            try:
                celda = sheet_stock.find(prod_nombre, in_column=2)
                if celda:
                    fila = celda.row
                    stock_actual = int(sheet_stock.cell(fila, 4).value or 0)
                    sheet_stock.update_cell(fila, 4, max(0, stock_actual - cant))
            except Exception as e:
                print(f"Aviso: No se pudo descontar stock del producto {prod_nombre}: {e}", flush=True)

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
            datos.get("medio_pago", "Efectivo"),
            email_cliente,
            telefono_cliente,
            direccion_cliente,
            "Pendiente"
        ]
        sheet_ventas.append_row(nueva_fila)

        if email_cliente:
            try:
                html = plantilla_email_confirmacion(cliente_nombre, descripcion_final, fecha_entrega, monto_total, estado_pedido)
                enviar_email_async(email_cliente, "🥐 ¡Tu pedido en CROISS está confirmado!", html)
            except Exception as ee:
                print(f"Aviso al enviar email: {ee}", flush=True)

        return jsonify({"status": "exito", "mensaje": "Pedido registrado correctamente", "id": nuevo_id}), 200
    except Exception as error:
        print(f"❌ Error en /api/venta: {error}", flush=True)
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/clientes', methods=['GET'])
def obtener_clientes():
    try:
        mes_filtro = request.args.get('mes', '').strip() or datetime.now().strftime("%Y-%m")
        sheet_ventas = conectar_sheet("Ventas")
        asegurar_encabezados_ventas(sheet_ventas)
        ventas = get_clean_records(sheet_ventas)

        clientes_historico, clientes_mes = {}, {}

        for idx, v in enumerate(ventas, start=2):
            cliente_nombre = get_field_val(v, "Cliente") or "Consumidor Final"
            if not cliente_nombre or cliente_nombre.lower() == "consumidor final": continue

            email_c = get_field_val(v, "Email", "Correo")
            tel_c = get_field_val(v, "Teléfono", "Telefono", "Tel")
            dir_c = get_field_val(v, "Dirección", "Direccion")
            fecha_norm = normalizar_fecha(get_field_val(v, "Fecha Pedido", "Fecha", "Fecha Entrega"))
            
            try:
                monto = float(get_field_val(v, "Monto Total", "Monto").replace("$", "").replace(",", ".").strip())
            except ValueError:
                monto = 0.0

            raw_cant = get_field_val(v, "Cantidad")
            cant = int(raw_cant) if raw_cant.isdigit() else 0
            key_norm = cliente_nombre.lower()

            pedido_item = {
                "fila": idx,
                "id": get_field_val(v, "ID Venta", "ID"),
                "fecha": fecha_norm,
                "producto": get_field_val(v, "Producto"),
                "cantidad": cant,
                "monto": monto,
                "estado": get_field_val(v, "Estado"),
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
                if email_c: clientes_historico[key_norm]["email"] = email_c
                if tel_c: clientes_historico[key_norm]["telefono"] = tel_c
                if dir_c: clientes_historico[key_norm]["direccion"] = dir_c

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
                else:
                    if email_c: clientes_mes[key_norm]["email"] = email_c
                    if tel_c: clientes_mes[key_norm]["telefono"] = tel_c
                    if dir_c: clientes_mes[key_norm]["direccion"] = dir_c

                clientes_mes[key_norm]["total_gastado"] += monto
                clientes_mes[key_norm]["total_croissants"] += cant
                clientes_mes[key_norm]["total_pedidos"] += 1
                clientes_mes[key_norm]["historial"].append(pedido_item)

        lista_historico = list(clientes_historico.values())
        lista_historico.sort(key=lambda x: x["nombre"].lower())
        for c in lista_historico: c["total_gastado"] = round(c["total_gastado"], 2)

        lista_mes = list(clientes_mes.values())
        # Ordena de mayor a menor por cantidad de croissants (y en caso de empate, por dinero gastado)
        lista_mes.sort(key=lambda x: (x["total_croissants"], x["total_gastado"]), reverse=True)
        for c in lista_mes: c["total_gastado"] = round(c["total_gastado"], 2)

        top_cliente_mes = lista_mes[0] if lista_mes else None

        return jsonify({
            "status": "exito",
            "mes_filtrado": mes_filtro,
            "clientes_todos": lista_historico,
            "ranking_mes": lista_mes,
            "top_cliente_mes": top_cliente_mes
        }), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock/actualizar', methods=['POST'])
def actualizar_stock():
    try:
        datos = request.json or {}
        prod_nombre = str(datos.get("producto", "")).strip()
        nuevo_stock = datos.get("stock")
        nuevo_precio = datos.get("precio")

        if not prod_nombre:
            return jsonify({"status": "error", "mensaje": "Producto no especificado"}), 400

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
            sheet_stock.update_cell(fila, col_stock, int(nuevo_stock))

        if nuevo_precio is not None:
            try:
                precio_val = float(str(nuevo_precio).replace("$", "").replace(",", "").strip())
                sheet_stock.update_cell(fila, col_precio, precio_val)
            except ValueError:
                pass

        return jsonify({"status": "exito", "mensaje": "Stock y precio actualizados correctamente"}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

def descontar_insumos_por_receta(producto_nombre, cantidad_vendida, total_croissants_pedido=0):
    try:
        sheet_insumos = obtener_o_crear_sheet_insumos()
        registros = get_clean_records(sheet_insumos)
        if not registros:
            return

        receta = obtener_receta_producto(producto_nombre)
        for ing_clave, cant_unit in receta.items():
            cant_total_a_descontar = cant_unit * cantidad_vendida
            for idx, ins_row in enumerate(registros, start=2):
                nombre_insumo = get_field_val(ins_row, "Insumo").lower()
                if ing_clave in nombre_insumo:
                    raw_st = get_field_val(ins_row, "Stock Actual").replace(",", ".").strip()
                    stock_actual = float(raw_st) if raw_st else 0.0
                    nuevo_stock = max(0.0, round(stock_actual - cant_total_a_descontar, 3))
                    sheet_insumos.update_cell(idx, 2, nuevo_stock)
                    break

        if total_croissants_pedido > 0:
            cajas_6_necesarias = total_croissants_pedido // 6
            resto = total_croissants_pedido % 6
            cajas_3_necesarias = (resto + 2) // 3

            def descontar_caja(tipo_capacidad, cantidad_cajas):
                if cantidad_cajas <= 0: return
                for idx, ins_row in enumerate(registros, start=2):
                    nombre_insumo = get_field_val(ins_row, "Insumo").lower()
                    if "caja" in nombre_insumo and tipo_capacidad in nombre_insumo:
                        raw_st = get_field_val(ins_row, "Stock Actual").replace(",", ".").strip()
                        stock_actual = float(raw_st) if raw_st else 0.0
                        if stock_actual > 0:
                            nuevo_stock = max(0.0, stock_actual - cantidad_cajas)
                            sheet_insumos.update_cell(idx, 2, nuevo_stock)
                            print(f"📦 [DESCUENTO CAJA] {nombre_insumo}: -{cantidad_cajas}", flush=True)
                            break

            descontar_caja("6", cajas_6_necesarias)
            descontar_caja("3", cajas_3_necesarias)

    except Exception as e:
        print(f"⚠️ Error descontando insumos/cajas: {e}", flush=True)

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
        sheet_gastos.append_row(nueva_fila)

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
                    sheet_insumos.update_cell(fila_encontrada, 2, nuevo_stock)
                    if venc:
                        sheet_insumos.update_cell(fila_encontrada, 4, venc)
                else:
                    sheet_insumos.append_row([desc, cant, unidad or "un", venc])
            except Exception as e:
                print(f"⚠️ Error actualizando Insumos_Stock: {e}", flush=True)

        return jsonify({"status": "exito", "mensaje": "Gasto registrado", "id": nuevo_id}), 200
    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)