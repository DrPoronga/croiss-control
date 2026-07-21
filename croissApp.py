import os
import re
from datetime import datetime, timedelta
from flask import Flask, jsonify, render_template, request
import gspread
from google.oauth2.service_account import Credentials

app = Flask(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive"
]

SPREADSHEET_ID = "1-HZ19zxOZWJXizFSrhb5m6OKJJWQ_207SuRqdLVNWWE"

def conectar_sheet(nombre_pestaña):
    """Función auxiliar para conectarse a una pestaña específica de la planilla"""
    ruta_credenciales = "credentials.json"
    
    if not os.path.exists(ruta_credenciales):
        raise FileNotFoundError("No se encontró el archivo credentials.json en la carpeta raíz.")
        
    creds = Credentials.from_service_account_file(ruta_credenciales, scopes=SCOPES)
    cliente = gspread.authorize(creds)
    sheet = cliente.open_by_key(SPREADSHEET_ID)
    return sheet.worksheet(nombre_pestaña)

def normalizar_fecha(fecha_raw):
    """Estandariza fechas a formato YYYY-MM-DD sin importar cómo las guarde Google Sheets"""
    if not fecha_raw:
        return ""
    f_str = str(fecha_raw).strip()
    
    try:
        return datetime.strptime(f_str, "%Y-%m-%d").strftime("%Y-%m-%d")
    except ValueError:
        pass

    try:
        return datetime.strptime(f_str, "%d/%m/%Y").strftime("%Y-%m-%d")
    except ValueError:
        pass

    return f_str

@app.route('/')
def inicio():
    """Sirve la página web principal"""
    return render_template('index.html')

@app.route('/api/agenda', methods=['GET'])
def obtener_agenda():
    """Endpoint para obtener el resumen de pedidos de los próximos 7 días"""
    try:
        sheet_ventas = conectar_sheet("Ventas")
        registros = sheet_ventas.get_all_records()
        
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
            f_entrega_raw = reg.get("Fecha Entrega", "")
            f_entrega_norm = normalizar_fecha(f_entrega_raw)

            if f_entrega_norm in dias_agenda:
                cant = int(reg.get("Cantidad", 0) or 0)
                dias_agenda[f_entrega_norm]["pedidos"].append({
                    "id": reg.get("ID Venta"),
                    "cliente": reg.get("Cliente"),
                    "descripcion": reg.get("Producto"),
                    "cantidad": cant,
                    "estado": reg.get("Estado")
                })
                dias_agenda[f_entrega_norm]["total_croissants"] += cant
                
        return jsonify({"status": "exito", "agenda": list(dias_agenda.values())}), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/venta', methods=['POST'])
def registrar_venta():
    """Endpoint para registrar un pedido completo con múltiples ítems y descontar stock"""
    try:
        datos = request.json
        sheet_ventas = conectar_sheet("Ventas")
        sheet_stock = conectar_sheet("Productos_Stock")
        
        registros = sheet_ventas.get_all_records()
        nuevo_id = f"V-{len(registros) + 1:04d}"
        
        items = datos.get("items", [])
        resumen_productos = []
        total_unidades = 0
        
        for item in items:
            prod_nombre = item.get("producto")
            cant = int(item.get("cantidad", 1))
            jalea_str = " (Con Jalea)" if item.get("con_jalea") else ""
            
            resumen_productos.append(f"{cant}x {prod_nombre}{jalea_str}")
            total_unidades += cant
            
            try:
                celda = sheet_stock.find(prod_nombre, in_column=2)
                if celda:
                    fila = celda.row
                    stock_actual = int(sheet_stock.cell(fila, 4).value or 0)
                    nuevo_stock = max(0, stock_actual - cant)
                    sheet_stock.update_cell(fila, 4, nuevo_stock)
            except Exception as e:
                print(f"Aviso: No se pudo descontar stock de {prod_nombre}: {e}")

        descripcion_final = ", ".join(resumen_productos)
        
        nueva_fila = [
            nuevo_id,
            datos.get("fecha"),
            datos.get("fecha_entrega"),
            datos.get("cliente", "Consumidor Final"),
            descripcion_final,
            total_unidades,
            datos.get("monto_total"),
            datos.get("estado", "Pagado"),
            datos.get("medio_pago", "Efectivo")
        ]
        
        sheet_ventas.append_row(nueva_fila)
        return jsonify({"status": "exito", "mensaje": "Pedido registrado correctamente", "id": nuevo_id}), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cuentas', methods=['GET'])
def obtener_cuentas():
    """Endpoint para filtrar quién debe dinero y qué pedidos están pendientes de entrega"""
    try:
        sheet_ventas = conectar_sheet("Ventas")
        registros = sheet_ventas.get_all_records()

        hoy_str = datetime.now().date().strftime("%Y-%m-%d")

        pendientes_pago = []
        pendientes_entrega = []
        total_por_cobrar = 0.0

        # Recorremos asignando 'idx' como el número de fila real en Google Sheets (Fila 1 es encabezado)
        for idx, reg in enumerate(registros, start=2):
            cliente = reg.get("Cliente") or "Cliente"
            prod = reg.get("Producto") or ""
            cant = reg.get("Cantidad") or 0
            
            raw_monto = str(reg.get("Monto Total") or reg.get("Monto") or 0).replace("$", "").replace(",", "").strip()
            try:
                monto = float(raw_monto)
            except ValueError:
                monto = 0.0

            estado = str(reg.get("Estado") or "").strip()
            f_entrega = normalizar_fecha(reg.get("Fecha Entrega") or "")

            item = {
                "fila": idx, # Coordenada exacta en Google Sheets
                "cliente": cliente,
                "producto": prod,
                "cantidad": cant,
                "monto": monto,
                "estado": estado,
                "fecha_entrega": f_entrega
            }

            # 1. Quién debe pagarme (Estado 'Pendiente')
            if estado.lower() == "pendiente":
                pendientes_pago.append(item)
                total_por_cobrar += monto

            # 2. A quién le debo pedidos (Fecha Entrega hoy o futura)
            if f_entrega and f_entrega >= hoy_str:
                pendientes_entrega.append(item)

        return jsonify({
            "status": "exito",
            "pendientes_pago": pendientes_pago,
            "pendientes_entrega": pendientes_entrega,
            "total_por_cobrar": round(total_por_cobrar, 2)
        }), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/cambiar_estado_pago', methods=['POST'])
def cambiar_estado_pago():
    """Endpoint directo por número de fila en Google Sheets"""
    try:
        datos = request.json or {}
        num_fila = datos.get("fila")
        nuevo_estado = datos.get("estado", "Pagado")

        if not num_fila:
            return jsonify({"status": "error", "mensaje": "Número de fila no especificado"}), 400

        sheet_ventas = conectar_sheet("Ventas")
        
        # Detectar la columna de 'Estado' en la primera fila
        headers = [str(h).strip().lower() for h in sheet_ventas.row_values(1)]
        col_estado = 8  # Columna H por defecto
        for i, h in enumerate(headers, start=1):
            if "estado" in h:
                col_estado = i
                break

        # Actualiza directamente la celda exacta
        sheet_ventas.update_cell(int(num_fila), col_estado, nuevo_estado)

        return jsonify({"status": "exito", "mensaje": "Estado actualizado correctamente"}), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500
        
@app.route('/api/gasto', methods=['POST'])
def registrar_gasto():
    """Endpoint para agregar un gasto"""
    try:
        datos = request.json
        sheet = conectar_sheet("Gastos")
        
        registros = sheet.get_all_records()
        nuevo_id = f"G-{len(registros) + 1:04d}"
        
        nueva_fila = [
            nuevo_id,
            datos.get("fecha"),
            datos.get("categoria"),
            datos.get("descripcion"),
            datos.get("monto")
        ]
        
        sheet.append_row(nueva_fila)
        return jsonify({"status": "exito", "mensaje": "Gasto registrado", "id": nuevo_id}), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/stock', methods=['GET'])
def obtener_stock():
    """Endpoint para consultar la lista de productos y stock actual"""
    try:
        sheet = conectar_sheet("Productos_Stock")
        productos = sheet.get_all_records()
        return jsonify({"status": "exito", "productos": productos}), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

@app.route('/api/balance', methods=['GET'])
def obtener_balance():
    """Endpoint para calcular el balance filtrado por mes o histórico"""
    try:
        mes_filtro = request.args.get('mes', '').strip()  # Formato YYYY-MM
        
        sheet_ventas = conectar_sheet("Ventas")
        sheet_gastos = conectar_sheet("Gastos")
        
        ventas = sheet_ventas.get_all_records()
        gastos = sheet_gastos.get_all_records()

        ingresos_totales = 0.0
        costo_produccion_total = 0.0
        gastos_totales = 0.0

        COSTO_CROISS_GRANDE = 22.90
        COSTO_POP_CROISS = 2.41

        for v in ventas:
            fecha_raw = v.get("Fecha Pedido") or v.get("Fecha") or v.get("Fecha Entrega") or ""
            fecha_norm = normalizar_fecha(fecha_raw)
            
            if mes_filtro and not fecha_norm.startswith(mes_filtro):
                continue

            raw_monto = str(v.get("Monto Total") or v.get("Monto") or 0).replace("$", "").replace(",", "").strip()
            try:
                monto = float(raw_monto)
            except ValueError:
                monto = 0.0

            ingresos_totales += monto

            raw_cant = str(v.get("Cantidad") or 0).strip()
            cant_unidades = int(raw_cant) if raw_cant.isdigit() else 0
            
            desc = str(v.get("Producto", "")).lower()

            items_partes = re.findall(r'(\d+)\s*x\s*([^,]+)', desc)
            costo_materia_prima = 0.0

            if items_partes:
                for cant_str, prod_nombre in items_partes:
                    c_item = int(cant_str)
                    c_unit = COSTO_POP_CROISS if "pop" in prod_nombre.lower() else COSTO_CROISS_GRANDE
                    costo_materia_prima += (c_item * c_unit)
            else:
                c_unit = COSTO_POP_CROISS if "pop" in desc else COSTO_CROISS_GRANDE
                costo_materia_prima = cant_unidades * c_unit

            if cant_unidades >= 6:
                costo_empaque = (cant_unidades // 6) * 36
            elif cant_unidades >= 3:
                costo_empaque = 27
            else:
                costo_empaque = cant_unidades * 5

            costo_produccion_total += (costo_materia_prima + costo_empaque)

        for g in gastos:
            fecha_g_raw = g.get("Fecha") or ""
            fecha_g_norm = normalizar_fecha(fecha_g_raw)

            if mes_filtro and not fecha_g_norm.startswith(mes_filtro):
                continue

            raw_monto_g = str(g.get("Monto") or 0).replace("$", "").replace(",", "").strip()
            try:
                monto_g = float(raw_monto_g)
            except ValueError:
                monto_g = 0.0

            gastos_totales += monto_g

        ganancia_neta = ingresos_totales - costo_produccion_total - gastos_totales

        return jsonify({
            "status": "exito",
            "mes_filtrado": mes_filtro or "Histórico",
            "ingresos": round(ingresos_totales, 2),
            "costos_produccion": round(costo_produccion_total, 2),
            "gastos_varios": round(gastos_totales, 2),
            "ganancia_neta": round(ganancia_neta, 2)
        }), 200

    except Exception as error:
        return jsonify({"status": "error", "mensaje": str(error)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)