#!/usr/bin/env python3
import os
import sys
import re
import json
import hmac
import hashlib
import base64
import time
import smtplib
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, SimpleHTTPRequestHandler
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from collections import defaultdict


def load_env(path='.env'):
    env = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, _, val = line.partition('=')
                    env[key.strip()] = val.strip()
    except FileNotFoundError:
        pass
    return env


_env = load_env(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

def get_env(key):
    return _env.get(key) or os.environ.get(key, '')

ADMIN_PASSWORD       = get_env('ADMIN_PASSWORD')
JWT_SECRET           = get_env('JWT_SECRET')
SUPABASE_URL         = get_env('SUPABASE_URL').rstrip('/')
SUPABASE_KEY         = get_env('SUPABASE_KEY')
ADMIN_PATH           = get_env('ADMIN_PATH') or '/gerbera-admin-2025'
PAYPAL_CLIENT_ID     = get_env('PAYPAL_CLIENT_ID') or ''
PAYPAL_CLIENT_SECRET = get_env('PAYPAL_CLIENT_SECRET') or ''
PAYPAL_MODE          = get_env('PAYPAL_MODE') or 'sandbox'
PAYPAL_BASE          = ('https://api-m.sandbox.paypal.com' if PAYPAL_MODE == 'sandbox'
                        else 'https://api-m.paypal.com')

# Rate limiting: máximo 5 intentos de login por IP en una ventana de 5 minutos
_login_attempts: dict = defaultdict(list)

def check_rate_limit(ip: str) -> bool:
    now     = time.time()
    window  = 300  # 5 minutos
    history = [t for t in _login_attempts[ip] if now - t < window]
    _login_attempts[ip] = history
    if len(history) >= 5:
        return False
    _login_attempts[ip].append(now)
    return True

if not ADMIN_PASSWORD or not JWT_SECRET:
    print('ERROR: Define ADMIN_PASSWORD y JWT_SECRET en el archivo .env')
    sys.exit(1)
if not SUPABASE_URL or not SUPABASE_KEY:
    print('ERROR: Define SUPABASE_URL y SUPABASE_KEY en el archivo .env')
    sys.exit(1)


# ── JWT ──────────────────────────────────────────────────────────────────────

def b64url_encode(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')

def b64url_decode(s):
    s += '=' * (4 - len(s) % 4)
    return base64.urlsafe_b64decode(s.encode('ascii'))

def create_token(payload):
    header = b64url_encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')))
    body   = b64url_encode(json.dumps(payload, separators=(',', ':')))
    msg    = f'{header}.{body}'.encode('utf-8')
    sig    = hmac.new(JWT_SECRET.encode('utf-8'), msg, hashlib.sha256).digest()
    return f'{header}.{body}.{b64url_encode(sig)}'

def verify_token(token):
    try:
        parts = token.split('.')
        if len(parts) != 3:
            return False
        msg      = f'{parts[0]}.{parts[1]}'.encode('utf-8')
        expected = hmac.new(JWT_SECRET.encode('utf-8'), msg, hashlib.sha256).digest()
        actual   = b64url_decode(parts[2])
        if not hmac.compare_digest(expected, actual):
            return False
        payload = json.loads(b64url_decode(parts[1]))
        return payload.get('exp', 0) >= time.time()
    except Exception:
        return False

def get_bearer(headers):
    auth = headers.get('Authorization', '')
    return auth[7:] if auth.startswith('Bearer ') else ''

def is_admin(headers):
    return verify_token(get_bearer(headers))


# ── Supabase REST helpers ─────────────────────────────────────────────────────

def sb_req(method, table, data=None, params=None):
    url = f'{SUPABASE_URL}/rest/v1/{table}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    body = json.dumps(data, ensure_ascii=False).encode('utf-8') if data is not None else None
    req  = urllib.request.Request(url, data=body, method=method)
    req.add_header('apikey',        SUPABASE_KEY)
    req.add_header('Authorization', f'Bearer {SUPABASE_KEY}')
    req.add_header('Content-Type',  'application/json')
    req.add_header('Prefer',        'return=representation')
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read()
            return (json.loads(raw) if raw else []), resp.status
    except urllib.error.HTTPError as e:
        return [], e.code

def sb_select(table, params=None):
    rows, _ = sb_req('GET', table, params=params)
    return rows if isinstance(rows, list) else []

def sb_insert(table, data):
    return sb_req('POST', table, data=data)

def sb_update(table, order_id, data):
    return sb_req('PATCH', table, data=data, params={'id': f'eq.{order_id}'})

def sb_delete(table, params):
    return sb_req('DELETE', table, params=params)


# ── Claude AI ─────────────────────────────────────────────────────────────────

BRAND_SYSTEM_PROMPT = (
    "Eres el asistente de contenido de Gerbera Bakery, una repostería artesanal hecha desde casa "
    "en Naucalpan, México. El tono de la marca es cálido, cercano y artesanal — como si una vecina "
    "talentosa te contara sobre sus postres. Nunca uses lenguaje corporativo ni frases genéricas de "
    "publicidad. Los productos son: Pastel de zanahoria ($36/porción), Pastel de naranja con cajeta "
    "($43/porción), Pastel de plátano con chispas de chocolate ($61/porción), Pastel de chocolate "
    "con frutos rojos ($54/porción), Cheesecake de guayaba ($37/porción) y Brownie de caramelo "
    "($48/porción). Las zonas de entrega son Naucalpan (Satélite, Lomas Verdes, San Mateo), "
    "Atizapán (Zona Esmeralda) y CDMX (Polanco, Reforma, Chapultepec). El slogan es "
    "'Horneando momentos que unen'. Genera captions en español mexicano, naturales y conversacionales."
)

def call_gemini(system_prompt, user_prompt):
    api_key = get_env('GEMINI_API_KEY')
    if not api_key or api_key.startswith('TU_GEMINI'):
        return None, 'GEMINI_API_KEY no configurada en el archivo .env'
    payload = {
        'systemInstruction': {'parts': [{'text': system_prompt}]},
        'contents': [{'parts': [{'text': user_prompt}]}],
        'generationConfig': {'maxOutputTokens': 1500, 'temperature': 0.8},
    }
    data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    url  = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}'
    req  = urllib.request.Request(url, data=data, method='POST')
    req.add_header('content-type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            result = json.loads(resp.read())
            return result['candidates'][0]['content']['parts'][0]['text'], None
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        return None, f'Error {e.code}: {body}'
    except Exception as e:
        return None, str(e)

def parse_ai_json(text):
    m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
    if m:
        text = m.group(1).strip()
    start, end = text.find('{'), text.rfind('}')
    if start != -1 and end != -1:
        text = text[start:end + 1]
    return json.loads(text)


# ── Field mapping ─────────────────────────────────────────────────────────────

def order_to_db(o):
    return {
        'id':             o.get('id'),
        'folio':          o.get('folio'),
        'customer_name':  o.get('customerName'),
        'phone':          o.get('phone'),
        'email':          o.get('email', ''),
        'whatsapp':       o.get('whatsapp', ''),
        'zone':           o.get('zone', ''),
        'address':        o.get('address', ''),
        'status':         o.get('status', 'Recibido'),
        'delivery_date':  o.get('deliveryDate', ''),
        'created_at':     o.get('createdAt', ''),
        'notes':          o.get('notes', ''),
        'item':           o.get('item'),
        'requested_items':o.get('requestedItems', []),
        'quantity':       o.get('quantity', 1),
        'total':          o.get('total', 0),
        'estimated_cost': o.get('estimatedCost', 0),
        'advance_paid':   o.get('advancePaid', 0),
        'refund_policy':  o.get('refundPolicy', 'No aplica'),
        'refund_amount':  o.get('refundAmount', 0),
        'notified_at':    o.get('notifiedAt', ''),
        'responded_at':   o.get('respondedAt', ''),
        'payment_status': o.get('paymentStatus', 'pending'),
        'payment_ref':    o.get('paymentRef', ''),
        'payment_amount': o.get('paymentAmount', 0),
        'paypal_order_id':o.get('paypalOrderId', ''),
    }

def order_from_db(r):
    return {
        'id':            r.get('id'),
        'folio':         r.get('folio'),
        'customerName':  r.get('customer_name'),
        'phone':         r.get('phone'),
        'email':         r.get('email', ''),
        'whatsapp':      r.get('whatsapp', ''),
        'zone':          r.get('zone', ''),
        'address':       r.get('address', ''),
        'status':        r.get('status'),
        'deliveryDate':  r.get('delivery_date', ''),
        'createdAt':     r.get('created_at', ''),
        'notes':         r.get('notes', ''),
        'item':          r.get('item'),
        'requestedItems':r.get('requested_items', []),
        'quantity':      r.get('quantity', 1),
        'total':         r.get('total', 0),
        'estimatedCost': r.get('estimated_cost', 0),
        'advancePaid':   r.get('advance_paid', 0),
        'refundPolicy':  r.get('refund_policy', 'No aplica'),
        'refundAmount':  r.get('refund_amount', 0),
        'notifiedAt':    r.get('notified_at', ''),
        'respondedAt':   r.get('responded_at', ''),
        'paymentStatus': r.get('payment_status', 'pending'),
        'paymentRef':    r.get('payment_ref', ''),
        'paymentAmount': r.get('payment_amount', 0),
        'paypalOrderId': r.get('paypal_order_id', ''),
        # Nombre del producto derivado de item o requested_items para uso en emails y pagos
        'productName':   ((r.get('requested_items') or [{}])[0].get('name') or
                          (r.get('item') or {}).get('name', 'Pedido')),
    }

def catalog_to_db(p):
    return {
        'id':             p.get('id'),
        'name':           p.get('name'),
        'description':    p.get('description', ''),
        'price':          p.get('price', 0),
        'estimated_cost': p.get('estimatedCost', 0),
        'full_price':     p.get('fullPrice', 0),
        'image':          p.get('image', ''),
        'images':         p.get('images', []),
        'highlights':     p.get('highlights', []),
    }

def catalog_from_db(r):
    return {
        'id':           r.get('id'),
        'name':         r.get('name'),
        'description':  r.get('description', ''),
        'price':        r.get('price', 0),
        'estimatedCost':r.get('estimated_cost', 0),
        'fullPrice':    r.get('full_price', 0),
        'image':        r.get('image', ''),
        'images':       r.get('images') or [],
        'highlights':   r.get('highlights') or [],
    }

def social_post_to_db(p):
    return {
        'id':             p.get('id'),
        'product':        p.get('product', 'General / Temporada'),
        'content_type':   p.get('contentType', 'Foto de producto'),
        'tone':           p.get('tone', 'Cálido y cercano'),
        'channel':        p.get('channel', 'ambos'),
        'scheduled_date': p.get('scheduledDate', ''),
        'scheduled_time': p.get('scheduledTime', ''),
        'caption':        p.get('caption', ''),
        'hashtags':       p.get('hashtags', ''),
        'image_idea':     p.get('imageIdea', ''),
        'best_time':      p.get('bestTime', ''),
        'status':         p.get('status', 'Borrador'),
        'notes':          p.get('notes', ''),
        'created_at':     p.get('createdAt', ''),
    }

def social_post_from_db(r):
    return {
        'id':            r.get('id'),
        'product':       r.get('product', 'General / Temporada'),
        'contentType':   r.get('content_type', 'Foto de producto'),
        'tone':          r.get('tone', 'Cálido y cercano'),
        'channel':       r.get('channel', 'ambos'),
        'scheduledDate': r.get('scheduled_date', ''),
        'scheduledTime': r.get('scheduled_time', ''),
        'caption':       r.get('caption', ''),
        'hashtags':      r.get('hashtags', ''),
        'imageIdea':     r.get('image_idea', ''),
        'bestTime':      r.get('best_time', ''),
        'status':        r.get('status', 'Borrador'),
        'notes':         r.get('notes', ''),
        'createdAt':     r.get('created_at', ''),
    }


# ── Catalog seed ──────────────────────────────────────────────────────────────

def make_svg(label, ca, cb):
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 600 360">'
        f'<rect width="600" height="360" rx="28" fill="{ca}"/>'
        f'<circle cx="300" cy="160" r="120" fill="{cb}"/>'
        f'<path d="M190 220c40-40 180-40 220 0" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round"/>'
        f'<text x="300" y="310" font-family="Arial" font-size="42" text-anchor="middle" fill="#fff">{label}</text>'
        f'</svg>'
    )
    return 'data:image/svg+xml;utf8,' + urllib.parse.quote(svg)

DEFAULT_CATALOG = [
    {'id':'zanahoria',         'name':'Pastel de zanahoria',                       'description':'Pastel de zanahoria con especias, crema de queso y textura suave.',        'price':36, 'estimatedCost':18, 'fullPrice':432, 'image':make_svg('Zanahoria',  '#f8d7e8','#d66aa7')},
    {'id':'naranja-cajeta',    'name':'Pastel de naranja con cajeta',               'description':'Pastel de naranja húmedo con cobertura de cajeta cremosa.',                'price':43, 'estimatedCost':22, 'fullPrice':516, 'image':make_svg('Naranja',    '#ffe9d8','#d66aa7')},
    {'id':'platano-chispas',   'name':'Pastel de plátano con chispas de chocolate', 'description':'Pan de plátano suave con chispas de chocolate y toque dulce.',            'price':61, 'estimatedCost':28, 'fullPrice':732, 'image':make_svg('Plátano',    '#ffe8d6','#b14f7d')},
    {'id':'chocolate-frutos',  'name':'Pastel de chocolate con frutos rojos',       'description':'Pastel chocolate intenso con compota de frutos rojos.',                   'price':54, 'estimatedCost':30, 'fullPrice':648, 'image':make_svg('Chocolate',  '#d3a1c0','#6b2b4c')},
    {'id':'cheesecake-guayaba','name':'Cheesecake de guayaba',                      'description':'Cheesecake cremoso con cubierta de guayaba y base crujiente.',            'price':37, 'estimatedCost':21, 'fullPrice':444, 'image':make_svg('Cheesecake', '#f4d2e1','#d66aa7')},
    {'id':'brownie-caramelo',  'name':'Brownie de caramelo',                        'description':'Brownie jugoso con corazón de caramelo y cobertura tostada.',             'price':48, 'estimatedCost':24, 'fullPrice':768, 'image':make_svg('Brownie',    '#f2d7da','#a44f66')},
]

# Zonas de entrega válidas — si el pedido llega con otra zona, se marca como fuera de cobertura
VALID_ZONES = {
    'Zona Esmeralda', 'Arboledas', 'Satélite', 'Lomas Verdes',
    'San Mateo / Paseos del Bosque', 'Reforma', 'Polanco', 'Chapultepec',
}

def seed_catalog_if_empty():
    try:
        rows = sb_select('catalog', {'select': 'id'})
        if not rows:
            sb_insert('catalog', [catalog_to_db(p) for p in DEFAULT_CATALOG])
            print('Catálogo inicial cargado.')
    except Exception as e:
        print(f'Aviso: no se pudo verificar catálogo — {e}')

def generate_folio():
    rows = sb_select('orders', {'select': 'folio', 'order': 'folio.desc', 'limit': '1'})
    if not rows:
        return 'GB-1001'
    last = rows[0].get('folio', 'GB-1000')
    try:
        num = int(last.split('-')[1]) + 1
    except (ValueError, IndexError):
        num = 1001
    return f'GB-{num}'


# ── Email ─────────────────────────────────────────────────────────────────────

def send_order_emails(order):
    app_pass    = get_env('GMAIL_APP_PASSWORD') or ''
    admin_email = get_env('ADMIN_EMAIL') or ''
    if not app_pass or not admin_email:
        print('[email] GMAIL_APP_PASSWORD o ADMIN_EMAIL no configurados — correos omitidos.')
        return

    folio          = order.get('folio', '—')
    customer_name  = order.get('customerName', 'Cliente')
    customer_email = order.get('email', '')
    whatsapp       = order.get('whatsapp', '—')
    items          = order.get('requestedItems', [])
    items_str      = ', '.join(f"{i['name']} x{i['quantity']}" for i in items) if items else (order.get('item') or {}).get('name', 'Sin datos')
    delivery_date  = order.get('deliveryDate', 'Por confirmar')
    zone           = order.get('zone', '—')
    address        = order.get('address', '—')
    notes          = order.get('notes', '') or 'Sin comentarios'
    total          = order.get('total', 0)
    total_fmt      = f'${total:,.0f} MXN'

    def _send(to_addr, subject, html_body):
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From']    = f'Gerbera Bakery <{admin_email}>'
        msg['To']      = to_addr
        msg.attach(MIMEText(html_body, 'html', 'utf-8'))
        try:
            with smtplib.SMTP('smtp.gmail.com', 587) as s:
                s.ehlo()
                s.starttls()
                s.login(admin_email, app_pass)
                s.send_message(msg)
            print(f'[email] Enviado a {to_addr} ✓')
        except Exception as e:
            print(f'[email] Error enviando a {to_addr}: {e}')

    # Correo al cliente ──────────────────────────────────────────────────────
    if customer_email:
        customer_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff9fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:24px;
              box-shadow:0 10px 40px rgba(214,106,167,0.14);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f2dce5,#ffe0ef);padding:32px;text-align:center;">
      <h1 style="margin:0;color:#4f2d3d;font-size:1.4rem;">Gerbera Bakery</h1>
      <p style="margin:6px 0 0;color:#7b4b63;font-size:0.9rem;">Horneando momentos que unen</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#3d2230;font-size:1rem;">Hola, <strong>{customer_name}</strong></p>
      <p style="color:#3d2230;">¡Recibimos tu pedido con éxito! Guarda este folio para rastrearlo:</p>
      <div style="background:#fff6fa;border-radius:16px;padding:20px;text-align:center;margin:20px 0;">
        <p style="margin:0;color:#7b4b63;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;">Tu folio</p>
        <p style="margin:8px 0 0;color:#4f2d3d;font-size:2rem;font-weight:800;letter-spacing:0.08em;">{folio}</p>
      </div>
      <h3 style="color:#4f2d3d;border-bottom:2px solid #f2dce5;padding-bottom:8px;margin-top:24px;">Resumen de tu pedido</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
        <tr><td style="padding:6px 0;color:#7b4b63;width:130px;">Producto(s)</td>
            <td style="padding:6px 0;color:#3d2230;font-weight:600;">{items_str}</td></tr>
        <tr><td style="padding:6px 0;color:#7b4b63;">Zona de entrega</td>
            <td style="padding:6px 0;color:#3d2230;">{zone}</td></tr>
        <tr><td style="padding:6px 0;color:#7b4b63;">Fecha solicitada</td>
            <td style="padding:6px 0;color:#3d2230;">{delivery_date}</td></tr>
        <tr><td style="padding:6px 0;color:#7b4b63;">Total</td>
            <td style="padding:6px 0;color:#d66aa7;font-weight:700;">{total_fmt}</td></tr>
      </table>
      <div style="background:#fff0f7;border-radius:12px;padding:16px;margin:24px 0;">
        <p style="margin:0;color:#7b4b63;font-size:0.9rem;">
          Estado actual: <strong style="color:#d66aa7;">Recibido</strong><br>
          <span style="font-size:0.85rem;">Pronto nos pondremos en contacto contigo para confirmar los detalles.</span>
        </p>
      </div>
      <p style="color:#3d2230;font-size:0.9rem;">
        Puedes rastrear tu pedido en cualquier momento ingresando tu folio
        <strong>{folio}</strong> en la sección "Rastrear mi pedido" de nuestro portal.
      </p>
      <hr style="border:none;border-top:2px solid #f2dce5;margin:24px 0;">
      <p style="margin:0;color:#4f2d3d;font-weight:700;font-size:0.95rem;">Gerbera Bakery</p>
      <p style="margin:4px 0 0;color:#7b4b63;font-size:0.85rem;font-style:italic;">Horneando momentos que unen</p>
    </div>
  </div>
</body></html>"""
        _send(customer_email,
              f'Tu pedido en Gerbera Bakery fue recibido — Folio {folio}',
              customer_html)

    # Correo al admin ────────────────────────────────────────────────────────
    admin_html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff9fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:24px;
              box-shadow:0 10px 40px rgba(214,106,167,0.14);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#4f2d3d,#7b4b63);padding:24px 32px;text-align:center;">
      <p style="margin:0;color:#f2dce5;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;">Nuevo pedido recibido</p>
      <p style="margin:6px 0 0;color:white;font-size:1.8rem;font-weight:800;letter-spacing:0.06em;">{folio}</p>
    </div>
    <div style="padding:32px;">
      <h3 style="color:#4f2d3d;margin-top:0;border-bottom:2px solid #f2dce5;padding-bottom:8px;">Datos del cliente</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
        <tr><td style="padding:5px 0;color:#7b4b63;width:130px;">Nombre</td>
            <td style="padding:5px 0;color:#3d2230;font-weight:600;">{customer_name}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Correo</td>
            <td style="padding:5px 0;color:#3d2230;">{customer_email or '—'}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">WhatsApp</td>
            <td style="padding:5px 0;color:#3d2230;">{whatsapp}</td></tr>
      </table>
      <h3 style="color:#4f2d3d;border-bottom:2px solid #f2dce5;padding-bottom:8px;">Detalles del pedido</h3>
      <table style="width:100%;border-collapse:collapse;font-size:0.95rem;">
        <tr><td style="padding:5px 0;color:#7b4b63;width:130px;">Producto(s)</td>
            <td style="padding:5px 0;color:#3d2230;font-weight:600;">{items_str}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Zona</td>
            <td style="padding:5px 0;color:#3d2230;">{zone}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Direcci&oacute;n</td>
            <td style="padding:5px 0;color:#3d2230;">{address}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Fecha solicitada</td>
            <td style="padding:5px 0;color:#3d2230;">{delivery_date}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Notas</td>
            <td style="padding:5px 0;color:#3d2230;">{notes}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Total estimado</td>
            <td style="padding:5px 0;color:#d66aa7;font-weight:700;">{total_fmt}</td></tr>
      </table>
      <div style="text-align:center;margin:28px 0 0;">
        <a href="http://127.0.0.1:3000/admin"
           style="display:inline-block;background:#d66aa7;color:white;text-decoration:none;
                  padding:12px 28px;border-radius:999px;font-weight:700;font-size:0.95rem;">
          Ver en panel admin &rarr;
        </a>
      </div>
    </div>
  </div>
</body></html>"""
    _send(admin_email,
          f'Nuevo pedido recibido — Folio {folio}',
          admin_html)


def send_status_update_email(order):
    app_pass       = get_env('GMAIL_APP_PASSWORD') or ''
    admin_email    = get_env('ADMIN_EMAIL') or ''
    customer_email = order.get('email', '')
    if not app_pass or not admin_email or not customer_email:
        return

    folio         = order.get('folio', '—')
    customer_name = order.get('customerName', 'Cliente')
    status        = order.get('status', '')
    delivery_date = order.get('deliveryDate', 'Por confirmar')
    items         = order.get('requestedItems', [])
    items_str     = ', '.join(f"{i['name']} x{i['quantity']}" for i in items) if items else (order.get('item') or {}).get('name', '—')

    status_messages = {
        'Confirmado':          ('¡Tu pedido fue confirmado!',           'Ya está en nuestra agenda. Comenzaremos a prepararlo pronto.'),
        'En producción':       ('¡Estamos horneando tu pedido!',        'Nuestro equipo está trabajando en él con mucho cariño.'),
        'Listo para entrega':  ('¡Tu pedido está listo!',               'Nos pondremos en contacto contigo para coordinar la entrega.'),
        'Entregado':           ('¡Tu pedido fue entregado!',            'Gracias por confiar en Gerbera Bakery. ¡Que lo disfrutes mucho!'),
        'Cancelado':           ('Tu pedido fue cancelado.',             'Si tienes dudas sobre tu reembolso, contáctanos por WhatsApp.'),
    }
    headline, message = status_messages.get(status, (f'Tu pedido cambió a: {status}', ''))

    status_color = {
        'Confirmado': '#2d7a4f', 'En producción': '#b36a00',
        'Listo para entrega': '#1a5fa8', 'Entregado': '#4f2d3d', 'Cancelado': '#b33f58',
    }.get(status, '#d66aa7')

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff9fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:24px;
              box-shadow:0 10px 40px rgba(214,106,167,0.14);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f2dce5,#ffe0ef);padding:32px;text-align:center;">
      <h1 style="margin:0;color:#4f2d3d;font-size:1.4rem;">Gerbera Bakery</h1>
      <p style="margin:6px 0 0;color:#7b4b63;font-size:0.9rem;">Horneando momentos que unen</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#3d2230;font-size:1rem;">Hola, <strong>{customer_name}</strong></p>
      <div style="background:#fff6fa;border-radius:16px;padding:20px;margin:16px 0;text-align:center;">
        <p style="margin:0;color:#7b4b63;font-size:0.85rem;text-transform:uppercase;letter-spacing:0.06em;">Folio</p>
        <p style="margin:6px 0;color:#4f2d3d;font-size:1.6rem;font-weight:800;">{folio}</p>
        <p style="margin:0;display:inline-block;background:{status_color};color:white;
                  padding:5px 16px;border-radius:999px;font-size:0.9rem;font-weight:700;">{status}</p>
      </div>
      <p style="color:#3d2230;font-size:1rem;"><strong>{headline}</strong></p>
      <p style="color:#7b4b63;font-size:0.95rem;">{message}</p>
      <table style="width:100%;border-collapse:collapse;font-size:0.92rem;margin-top:16px;">
        <tr><td style="padding:5px 0;color:#7b4b63;width:130px;">Producto(s)</td>
            <td style="padding:5px 0;color:#3d2230;font-weight:600;">{items_str}</td></tr>
        <tr><td style="padding:5px 0;color:#7b4b63;">Fecha de entrega</td>
            <td style="padding:5px 0;color:#3d2230;">{delivery_date}</td></tr>
      </table>
      <hr style="border:none;border-top:2px solid #f2dce5;margin:24px 0;">
      <p style="margin:0;color:#4f2d3d;font-weight:700;font-size:0.95rem;">Gerbera Bakery</p>
      <p style="margin:4px 0 0;color:#7b4b63;font-size:0.85rem;font-style:italic;">Horneando momentos que unen</p>
    </div>
  </div>
</body></html>"""

    msg = MIMEMultipart('alternative')
    msg['Subject'] = f'Actualización de tu pedido {folio} — {status}'
    msg['From']    = f'Gerbera Bakery <{admin_email}>'
    msg['To']      = customer_email
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as s:
            s.ehlo()
            s.starttls()
            s.login(admin_email, app_pass)
            s.send_message(msg)
        print(f'[email] Notificación de status "{status}" enviada a {customer_email} ✓')
    except Exception as e:
        print(f'[email] Error en notificación de status: {e}')


# ── Cálculo de reembolso ──────────────────────────────────────────────────────

def compute_refund(current_status: str, advance_paid: float) -> dict:
    in_prod = current_status in ('En producción', 'Listo para entrega', 'Entregado')
    return {
        'refund_policy': '50% del anticipo' if in_prod else '100% del anticipo',
        'refund_amount': round(advance_paid * 0.5) if in_prod else advance_paid,
    }

# ── Correo de zona fuera de cobertura ─────────────────────────────────────────

def send_out_of_zone_email(order):
    app_pass       = get_env('GMAIL_APP_PASSWORD') or ''
    admin_email    = get_env('ADMIN_EMAIL') or ''
    customer_email = order.get('email', '')
    if not app_pass or not admin_email or not customer_email:
        return False, 'Falta configuración de correo o el cliente no dejó email.'

    customer_name = order.get('customerName', 'Cliente')
    folio         = order.get('folio', '—')

    html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#fff9fb;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:40px auto;background:white;border-radius:24px;
              box-shadow:0 10px 40px rgba(214,106,167,0.14);overflow:hidden;">
    <div style="background:linear-gradient(135deg,#f2dce5,#ffe0ef);padding:32px;text-align:center;">
      <h1 style="margin:0;color:#4f2d3d;font-size:1.4rem;">Gerbera Bakery</h1>
      <p style="margin:6px 0 0;color:#7b4b63;font-size:0.9rem;">Horneando momentos que unen</p>
    </div>
    <div style="padding:32px;">
      <p style="color:#3d2230;font-size:1rem;">Hola, <strong>{customer_name}</strong></p>
      <p style="color:#3d2230;">Gracias por tu pedido en Gerbera Bakery 🌸</p>
      <p style="color:#3d2230;">Revisamos tu c&oacute;digo postal y lamentablemente por el momento no contamos con cobertura de entrega en tu zona.</p>
      <div style="background:#fff8e6;border:2px solid #f59e0b;border-radius:16px;padding:20px;margin:20px 0;">
        <p style="margin:0 0 12px;color:#92400e;font-weight:700;">Nuestras zonas de entrega son:</p>
        <p style="margin:0 0 6px;color:#3d2230;">&#x2705; <strong>Sin costo de env&iacute;o:</strong></p>
        <p style="margin:0 0 4px;color:#3d2230;padding-left:16px;">&middot; Naucalpan: Sat&eacute;lite, Lomas Verdes, San Mateo</p>
        <p style="margin:0 0 12px;color:#3d2230;padding-left:16px;">&middot; Atizap&aacute;n: Zona Esmeralda</p>
        <p style="margin:0 0 6px;color:#3d2230;">&#x1F697; <strong>Con costo de env&iacute;o ($50):</strong></p>
        <p style="margin:0;color:#3d2230;padding-left:16px;">&middot; CDMX: Polanco, Reforma, Chapultepec</p>
      </div>
      <p style="color:#3d2230;">&iquest;Tienes alguna direcci&oacute;n de entrega dentro de estas zonas? Con gusto coordinamos tu pedido. Si no es posible, podemos cancelarlo sin ning&uacute;n costo para ti.</p>
      <p style="color:#7b4b63;font-size:0.9rem;">Tu folio de referencia: <strong style="color:#d66aa7;">{folio}</strong></p>
      <p style="color:#7b4b63;font-size:0.9rem;">Responde directamente a este correo para coordinar.</p>
      <hr style="border:none;border-top:2px solid #f2dce5;margin:24px 0;">
      <p style="margin:0;color:#4f2d3d;font-weight:700;font-size:0.95rem;">Gerbera Bakery</p>
      <p style="margin:4px 0 0;color:#7b4b63;font-size:0.85rem;font-style:italic;">Horneando momentos que unen</p>
    </div>
  </div>
</body></html>"""

    msg = MIMEMultipart('alternative')
    msg['Subject']  = f'Tu pedido {folio} en Gerbera Bakery — Verificar zona de entrega'
    msg['From']     = f'Gerbera Bakery <{admin_email}>'
    msg['To']       = customer_email
    msg['Reply-To'] = admin_email
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP('smtp.gmail.com', 587) as s:
            s.ehlo(); s.starttls()
            s.login(admin_email, app_pass)
            s.send_message(msg)
        print(f'[email] Correo de zona enviado a {customer_email} ✓')
        return True, None
    except Exception as e:
        print(f'[email] Error en correo de zona: {e}')
        return False, str(e)


# ── Mensajes personalizados por IA ────────────────────────────────────────────

MESSAGE_SYSTEM_PROMPT = (
    "Eres la voz de Gerbera Bakery, una repostería artesanal casera en Naucalpan, México. "
    "Tu tono es cálido, amable y profesional — como una emprendedora cercana que cuida genuinamente "
    "a sus clientes. Redacta mensajes en español mexicano natural, sin lenguaje corporativo. "
    "Los mensajes deben ser concisos (máximo 5 oraciones), con emojis sutiles y apropiados al contexto. "
    "Incluye siempre el nombre del cliente y detalles relevantes del pedido. "
    "Firma siempre con 'Gerbera Bakery 🌸'. "
    "Responde ÚNICAMENTE con el texto del mensaje listo para enviar, sin explicaciones ni encabezados."
)

MESSAGE_TYPE_LABELS = {
    'confirmacion':  'Confirmar al cliente que su pedido fue recibido y está siendo preparado con cariño.',
    'recordatorio':  'Recordarle amablemente al cliente que su entrega es en los próximos días y darle confianza.',
    'listo':         'Avisarle al cliente que su pedido está listo y será entregado muy pronto.',
    'retraso':       'Informar con mucho tacto sobre un retraso o cambio en la fecha de entrega, disculpándose.',
    'pago':          'Recordarle al cliente de forma amable y sin presión que tiene un anticipo pendiente de pago.',
    'gracias':       'Agradecerle al cliente por su compra, expresar que fue un gusto prepararle su pedido e invitarle a volver.',
}

def send_custom_message_email(order, message_text):
    app_pass    = get_env('GMAIL_APP_PASSWORD') or ''
    admin_email = get_env('ADMIN_EMAIL') or ''
    to_email    = order.get('email', '')
    if not to_email:
        return False, 'El cliente no tiene correo electrónico registrado.'
    if not app_pass or not admin_email:
        return False, 'Credenciales de correo no configuradas en .env'
    subject  = f"Gerbera Bakery — Tu pedido {order.get('folio', '')}"
    html_msg = message_text.replace('\n', '<br>')
    html = (
        '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#4f2d3d">'
        '<div style="background:#f9e4ef;padding:24px;border-radius:12px 12px 0 0;text-align:center">'
        '<h1 style="margin:0;font-size:1.5rem;color:#d66aa7">Gerbera Bakery 🌸</h1></div>'
        '<div style="padding:24px;background:#fff;border-radius:0 0 12px 12px">'
        f'<p style="line-height:1.8;font-size:1rem;white-space:pre-line">{html_msg}</p>'
        '</div></div>'
    )
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = admin_email
    msg['To']      = to_email
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as smtp:
            smtp.login(admin_email, app_pass)
            smtp.sendmail(admin_email, to_email, msg.as_string())
        return True, None
    except Exception as e:
        return False, str(e)

# ── PayPal REST helpers ───────────────────────────────────────────────────────

def _paypal_token():
    creds = base64.b64encode(f'{PAYPAL_CLIENT_ID}:{PAYPAL_CLIENT_SECRET}'.encode()).decode()
    req   = urllib.request.Request(f'{PAYPAL_BASE}/v1/oauth2/token',
                                   data=b'grant_type=client_credentials', method='POST')
    req.add_header('Authorization', f'Basic {creds}')
    req.add_header('Content-Type',  'application/x-www-form-urlencoded')
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())['access_token']

def _paypal_req(method, path, payload=None):
    token = _paypal_token()
    data  = json.dumps(payload, ensure_ascii=False).encode() if payload else None
    req   = urllib.request.Request(f'{PAYPAL_BASE}{path}', data=data, method=method)
    req.add_header('Authorization', f'Bearer {token}')
    req.add_header('Content-Type',  'application/json')
    req.add_header('Prefer',        'return=representation')
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
            return (json.loads(body) if body else {}), r.status
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8', errors='replace')
        try:    return json.loads(body), e.code
        except: return {'error': body}, e.code

# ── Capa de abstracción de pagos (hoy PayPal; mañana Mercado Pago u otro) ────

def payment_create(amount: float, currency: str, internal_order_id: str, description: str) -> str:
    """Crea una orden de cobro. Devuelve el provider_order_id."""
    result, code = _paypal_req('POST', '/v2/checkout/orders', {
        'intent': 'CAPTURE',
        'purchase_units': [{
            'reference_id': internal_order_id,
            'description':  description[:127],
            'amount': {'currency_code': currency, 'value': f'{amount:.2f}'}
        }]
    })
    if code not in (200, 201):
        raise Exception(f'PayPal error {code}: {result}')
    return result['id']

def payment_capture(provider_order_id: str) -> dict:
    """Captura un pago aprobado. Devuelve {transaction_id, amount, currency, status}."""
    result, code = _paypal_req('POST', f'/v2/checkout/orders/{provider_order_id}/capture')
    if code not in (200, 201):
        raise Exception(f'PayPal capture error {code}: {result}')
    capture = result['purchase_units'][0]['payments']['captures'][0]
    return {
        'transaction_id': capture['id'],
        'amount':         float(capture['amount']['value']),
        'currency':       capture['amount']['currency_code'],
        'status':         capture['status'],
    }

# ── Emails de confirmación de pago ────────────────────────────────────────────

def send_payment_confirmation_email(order, txn):
    app_pass    = get_env('GMAIL_APP_PASSWORD') or ''
    admin_email = get_env('ADMIN_EMAIL') or ''
    to_email    = order.get('email', '')
    if not to_email or not app_pass or not admin_email:
        return False, 'Credenciales de correo no configuradas.'
    folio      = order.get('folio', '')
    total_fmt  = f"${txn['amount']:,.0f} {txn['currency']}"
    subject    = f"Pago confirmado — Pedido {folio} en Gerbera Bakery"
    html = (
        '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#4f2d3d">'
        '<div style="background:linear-gradient(135deg,#f9d8ed,#f0e8ff);padding:24px;border-radius:12px 12px 0 0;text-align:center">'
        '<h1 style="margin:0;font-size:1.6rem;color:#d66aa7">Gerbera Bakery 🌸</h1>'
        '<p style="margin:6px 0 0;color:#7c3aed;font-weight:600;font-size:1.05rem">✅ ¡Tu pago fue confirmado!</p></div>'
        '<div style="padding:24px;background:#fff;border-radius:0 0 12px 12px">'
        f'<p>Hola <strong>{order.get("customerName","cliente")}</strong>,</p>'
        '<p>Recibimos tu pago y tu pedido ya está en marcha 🎉</p>'
        '<table style="width:100%;border-collapse:collapse;margin:16px 0">'
        f'<tr style="background:#fdf4ff"><td style="padding:8px;font-weight:700">Folio</td><td style="padding:8px">{folio}</td></tr>'
        f'<tr><td style="padding:8px;font-weight:700">Producto</td><td style="padding:8px">{order.get("productName","")}</td></tr>'
        f'<tr style="background:#fdf4ff"><td style="padding:8px;font-weight:700">Fecha de entrega</td><td style="padding:8px">{order.get("deliveryDate","Por confirmar")}</td></tr>'
        f'<tr><td style="padding:8px;font-weight:700">Zona de entrega</td><td style="padding:8px">{order.get("zone","")}</td></tr>'
        f'<tr style="background:#fdf4ff"><td style="padding:8px;font-weight:700;color:#16a34a">Total pagado</td><td style="padding:8px;font-weight:700;color:#16a34a">{total_fmt}</td></tr>'
        f'<tr><td style="padding:8px;font-weight:700">Ref. PayPal</td><td style="padding:8px;font-size:0.82rem;color:#888">{txn["transaction_id"]}</td></tr>'
        '</table>'
        '<p>Puedes rastrear tu pedido con tu folio en cualquier momento.</p>'
        '<p style="color:#888;font-size:0.9rem;margin-top:24px">Horneando momentos que unen 🌸<br><strong>Gerbera Bakery</strong></p>'
        '</div></div>'
    )
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = admin_email
    msg['To']      = to_email
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
            s.login(admin_email, app_pass)
            s.sendmail(admin_email, to_email, msg.as_string())
        return True, None
    except Exception as e:
        return False, str(e)

def send_admin_payment_notification(order, txn):
    app_pass    = get_env('GMAIL_APP_PASSWORD') or ''
    admin_email = get_env('ADMIN_EMAIL') or ''
    if not app_pass or not admin_email:
        return False, 'Credenciales no configuradas.'
    total_fmt = f"${txn['amount']:,.0f} {txn['currency']}"
    subject   = f"💳 Nuevo pago — {order.get('folio','')} · {total_fmt}"
    html = (
        '<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;color:#4f2d3d">'
        '<h2 style="color:#d66aa7">Nuevo pago recibido 🌸</h2>'
        '<table style="width:100%;border-collapse:collapse">'
        f'<tr><td style="padding:7px;font-weight:700">Folio</td><td style="padding:7px">{order.get("folio","")}</td></tr>'
        f'<tr style="background:#fdf4ff"><td style="padding:7px;font-weight:700">Cliente</td><td style="padding:7px">{order.get("customerName","")}</td></tr>'
        f'<tr><td style="padding:7px;font-weight:700">Producto</td><td style="padding:7px">{order.get("productName","")}</td></tr>'
        f'<tr style="background:#fdf4ff"><td style="padding:7px;font-weight:700">Entrega</td><td style="padding:7px">{order.get("deliveryDate","Por definir")}</td></tr>'
        f'<tr><td style="padding:7px;font-weight:700;color:#16a34a">Monto recibido</td><td style="padding:7px;font-weight:700;color:#16a34a">{total_fmt}</td></tr>'
        f'<tr style="background:#fdf4ff"><td style="padding:7px;font-weight:700">Ref. PayPal</td><td style="padding:7px;font-size:0.85rem">{txn["transaction_id"]}</td></tr>'
        '</table></div>'
    )
    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = admin_email
    msg['To']      = admin_email
    msg.attach(MIMEText(html, 'html', 'utf-8'))
    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
            s.login(admin_email, app_pass)
            s.sendmail(admin_email, admin_email, msg.as_string())
        return True, None
    except Exception as e:
        return False, str(e)

# ── Limpieza automática de pedidos abandonados ────────────────────────────────

def cleanup_abandoned_payments():
    """Cancela pedidos en 'Pendiente de pago' con más de 24 horas sin pagar."""
    cutoff = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(time.time() - 86400))
    rows = sb_select('orders', {'status': 'eq.Pendiente de pago', 'created_at': f'lt.{cutoff}'})
    for row in rows:
        sb_update('orders', row['id'], {
            'status':        'Cancelado',
            'refund_policy': 'Sin cargo — pago no completado',
            'refund_amount': 0,
        })
        print(f'[cleanup] Pedido {row.get("folio", row["id"])} cancelado por falta de pago.')

# ── HTTP handler ──────────────────────────────────────────────────────────────

STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

# Solo estas extensiones pueden servirse desde /src/ — todo lo demás es 403
_ALLOWED_SRC_EXT = ('.js', '.css', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf')

class GerberaHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def _body(self):
        n = int(self.headers.get('Content-Length', 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def _json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _parse(self):
        p = urllib.parse.urlparse(self.path)
        return p.path, dict(urllib.parse.parse_qsl(p.query))

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    # ── GET ──────────────────────────────────────────────────────────────────

    def do_GET(self):
        path, params = self._parse()

        if path == '/api/catalog':
            rows = sb_select('catalog', {'order': 'name.asc'})
            return self._json(200, [catalog_from_db(r) for r in rows])

        if path == '/api/orders':
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            # Limpieza de pedidos sin pago de más de 24 h (side-effect ligero)
            try: cleanup_abandoned_payments()
            except Exception as _ce: print(f'[cleanup] {_ce}')
            rows = sb_select('orders', {'order': 'created_at.desc'})
            return self._json(200, [order_from_db(r) for r in rows])

        if path == '/api/paypal-config':
            return self._json(200, {'clientId': PAYPAL_CLIENT_ID, 'mode': PAYPAL_MODE})

        if path == '/api/orders/folio':
            folio = params.get('q', '').strip().upper()
            if not folio:
                return self._json(400, {'error': 'Folio requerido.'})
            rows = sb_select('orders', {'folio': f'eq.{folio}'})
            if not rows:
                return self._json(404, {'error': 'No se encontró un pedido con ese folio.'})
            return self._json(200, order_from_db(rows[0]))

        if path == '/api/site-config':
            rows = sb_select('site_config', {})
            config = {row['key']: row['value'] for row in rows}
            return self._json(200, config)

        if path == '/api/social-posts':
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            rows = sb_select('social_posts', {'order': 'scheduled_date.asc'})
            return self._json(200, [social_post_from_db(r) for r in rows])

        if path == '/api/admin-verify':
            token = get_bearer(self.headers)
            valid = verify_token(token)
            return self._json(200 if valid else 401, {'valid': valid})

        # Whitelist estricta: solo index.html y /src/ con extensiones permitidas
        # NUNCA servir .env, server.py, README.md, package.json ni ningún otro archivo raíz
        if path in ('/', '/index.html'):
            self.path = '/index.html'
            return super().do_GET()

        if path.startswith('/src/') and any(path.split('?')[0].endswith(ext) for ext in _ALLOWED_SRC_EXT):
            return super().do_GET()

        # SPA fallback para rutas del cliente (ej. /gerbera-admin-2025)
        if not path.startswith('/api/') and not path.startswith('/src/'):
            self.path = '/index.html'
            return super().do_GET()

        return self._json(403, {'error': 'Acceso denegado.'})

    # ── POST ─────────────────────────────────────────────────────────────────

    def do_POST(self):
        path, _ = self._parse()
        body = self._body()

        if path == '/api/contact':
            name    = body.get('name', '').strip()
            phone   = body.get('phone', '').strip()
            email   = body.get('email', '').strip()
            folio   = body.get('folio', '').strip()
            message = body.get('message', '').strip()
            if not name or not phone or not email or not message:
                return self._json(400, {'error': 'Por favor completa todos los campos requeridos.'})
            admin_email = get_env('ADMIN_EMAIL') or ''
            app_pass    = get_env('GMAIL_APP_PASSWORD') or ''
            if admin_email and app_pass:
                try:
                    folio_line = f'<p><strong>Folio relacionado:</strong> {folio}</p>' if folio else ''
                    html = (
                        '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#4f2d3d">'
                        '<div style="background:#f9e4ef;padding:24px;border-radius:12px 12px 0 0;text-align:center">'
                        '<h1 style="margin:0;font-size:1.4rem;color:#d66aa7">Gerbera Bakery 🌸 — Nuevo mensaje de contacto</h1></div>'
                        '<div style="padding:24px;background:#fff;border-radius:0 0 12px 12px">'
                        f'<p><strong>Nombre:</strong> {name}</p>'
                        f'<p><strong>Teléfono:</strong> {phone}</p>'
                        f'<p><strong>Correo:</strong> {email}</p>'
                        f'{folio_line}'
                        f'<p><strong>Mensaje:</strong></p><p style="white-space:pre-line;line-height:1.7">{message}</p>'
                        '</div></div>'
                    )
                    msg = MIMEMultipart('alternative')
                    msg['Subject'] = f'Gerbera Bakery — Contacto de {name}'
                    msg['From']    = admin_email
                    msg['To']      = admin_email
                    msg.attach(MIMEText(html, 'html', 'utf-8'))
                    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as s:
                        s.login(admin_email, app_pass)
                        s.sendmail(admin_email, admin_email, msg.as_string())
                except Exception as e:
                    print(f'[contact] Error enviando email: {e}')
            return self._json(200, {'ok': True})

        if path == '/api/admin-login':
            ip = self.client_address[0]
            if not check_rate_limit(ip):
                return self._json(429, {'error': 'Demasiados intentos. Espera 5 minutos.'})
            pw = body.get('password', '')
            a, b = pw.encode('utf-8'), ADMIN_PASSWORD.encode('utf-8')
            if len(a) == len(b) and hmac.compare_digest(a, b):
                token = create_token({'role': 'admin', 'exp': int(time.time()) + 8 * 3600})
                return self._json(200, {'token': token, 'adminPath': ADMIN_PATH})
            return self._json(401, {'error': 'Contraseña incorrecta.'})

        if path == '/api/orders':
            order = body.copy()
            order['id']    = f'ord-{int(time.time() * 1000)}'
            order['folio'] = generate_folio()
            zone = order.get('zone', '')
            # Si el CP está fuera de cobertura → estado especial; si no → espera pago
            order['status'] = 'CP fuera de cobertura' if zone not in VALID_ZONES else 'Pendiente de pago'
            result, code = sb_insert('orders', order_to_db(order))
            if code in (200, 201) and result:
                return self._json(201, order_from_db(result[0]))
            return self._json(500, {'error': 'Error al guardar el pedido.'})

        if path == '/api/payments/create-order':
            order_id = body.get('orderId', '')
            if not order_id:
                return self._json(400, {'error': 'orderId requerido.'})
            rows = sb_select('orders', {'id': f'eq.{order_id}'})
            if not rows:
                return self._json(404, {'error': 'Pedido no encontrado.'})
            order = order_from_db(rows[0])
            if order.get('status') != 'Pendiente de pago':
                return self._json(400, {'error': 'Este pedido no está en espera de pago.'})
            try:
                provider_id = payment_create(
                    amount=float(order.get('total', 0)),
                    currency='MXN',
                    internal_order_id=order_id,
                    description=f"Gerbera Bakery — {order.get('productName','Pedido')} x{order.get('quantity',1)}"
                )
                sb_update('orders', order_id, {'paypal_order_id': provider_id})
                return self._json(200, {'paypalOrderId': provider_id})
            except Exception as e:
                return self._json(500, {'error': str(e)})

        if path == '/api/payments/capture-order':
            order_id        = body.get('orderId', '')
            paypal_order_id = body.get('paypalOrderId', '')
            if not order_id or not paypal_order_id:
                return self._json(400, {'error': 'orderId y paypalOrderId requeridos.'})
            rows = sb_select('orders', {'id': f'eq.{order_id}'})
            if not rows:
                return self._json(404, {'error': 'Pedido no encontrado.'})
            order = order_from_db(rows[0])
            # Verificar que el paypal_order_id corresponde a este pedido
            if order.get('paypalOrderId') != paypal_order_id:
                return self._json(400, {'error': 'Referencia de pago inválida.'})
            try:
                txn = payment_capture(paypal_order_id)
                result, code = sb_update('orders', order_id, {
                    'status':         'Recibido',
                    'payment_status': 'paid',
                    'payment_ref':    txn['transaction_id'],
                    'payment_amount': txn['amount'],
                    'advance_paid':   txn['amount'],  # pago del 100%
                })
                if code not in (200, 201):
                    return self._json(500, {'error': 'Pago capturado pero error al actualizar pedido.'})
                updated = order_from_db(result[0])
                try:
                    send_payment_confirmation_email(updated, txn)
                    send_admin_payment_notification(updated, txn)
                except Exception as e:
                    print(f'[payment email] {e}')
                return self._json(200, {
                    'ok':            True,
                    'transactionId': txn['transaction_id'],
                    'amount':        txn['amount'],
                    'currency':      txn['currency'],
                    'folio':         updated.get('folio', ''),
                    'order':         updated,
                })
            except Exception as e:
                return self._json(500, {'error': f'Error al capturar el pago: {e}'})

        if path == '/api/social-posts':
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            post = body.copy()
            post['id']        = f'sp-{int(time.time() * 1000)}'
            post['createdAt'] = time.strftime('%Y-%m-%dT%H:%M:%S')
            result, code = sb_insert('social_posts', [social_post_to_db(post)])
            if code in (200, 201) and result:
                return self._json(201, social_post_from_db(result[0]))
            return self._json(500, {'error': 'Error al guardar el post.'})

        if path == '/api/ai/generate-post':
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            product      = body.get('product', 'General / Temporada')
            content_type = body.get('contentType', 'Foto de producto')
            tone         = body.get('tone', 'Cálido y cercano')
            channel      = body.get('channel', 'ambos')
            date_str     = body.get('scheduledDate', '')
            notes        = body.get('notes', '')
            channel_text = {'instagram': 'Instagram', 'facebook': 'Facebook', 'ambos': 'Instagram y Facebook'}.get(channel, channel)
            user_prompt  = (
                f"Genera contenido para redes sociales con las siguientes características:\n"
                f"- Producto: {product}\n"
                f"- Tipo de contenido: {content_type}\n"
                f"- Tono: {tone}\n"
                f"- Canal: {channel_text}\n"
                f"- Fecha de publicación: {date_str if date_str else 'por definir'}\n"
                f"- Notas adicionales: {notes if notes else 'Ninguna'}\n\n"
                f"Responde ÚNICAMENTE en formato JSON con exactamente esta estructura (sin texto antes ni después):\n"
                f'{{\n'
                f'  "caption": "caption completo listo para publicar (2-4 párrafos con emojis naturales)",\n'
                f'  "hashtags": "#hashtag1 #hashtag2 ... (15-20 hashtags: alcance amplio + nicho repostería + locales Naucalpan/CDMX)",\n'
                f'  "best_time": "sugerencia de mejor hora para publicar según el día y canal",\n'
                f'  "image_idea": "descripción breve de qué fotografiar o grabar"\n'
                f'}}'
            )
            text, err = call_gemini(BRAND_SYSTEM_PROMPT, user_prompt)
            if err:
                return self._json(500, {'error': err})
            try:
                result = parse_ai_json(text)
                return self._json(200, result)
            except Exception as e:
                return self._json(500, {'error': f'Error al procesar respuesta: {e}', 'raw': text})

        if path.startswith('/api/orders/') and path.endswith('/cancel'):
            order_id = path.split('/')[-2]
            rows = sb_select('orders', {'id': f'eq.{order_id}'})
            if not rows:
                return self._json(404, {'error': 'Pedido no encontrado.'})
            current = rows[0]
            if current.get('status') in ('Cancelado', 'Entregado'):
                return self._json(400, {'error': 'Este pedido ya no puede cancelarse.'})
            advance = float(current.get('advance_paid', 0))
            patch = {'status': 'Cancelado', **compute_refund(current.get('status', ''), advance)}
            result, code = sb_update('orders', order_id, patch)
            if code in (200, 201) and result:
                return self._json(200, order_from_db(result[0]))
            return self._json(500, {'error': 'Error al cancelar.'})

        if path.startswith('/api/orders/') and path.endswith('/notify-zone'):
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            order_id = path.split('/')[-2]
            method   = body.get('method', 'whatsapp')
            now_str  = time.strftime('%Y-%m-%dT%H:%M:%S')
            if method == 'email':
                rows = sb_select('orders', {'id': f'eq.{order_id}'})
                if rows:
                    order_data = order_from_db(rows[0])
                    ok, err = send_out_of_zone_email(order_data)
                    if not ok:
                        return self._json(500, {'error': err or 'Error al enviar correo.'})
            result, code = sb_update('orders', order_id, {'notified_at': now_str})
            if code in (200, 201) and result:
                return self._json(200, order_from_db(result[0]))
            return self._json(500, {'error': 'Error al registrar notificación.'})

        if path.startswith('/api/orders/') and path.endswith('/generate-message'):
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            order_id   = path.split('/')[-2]
            rows       = sb_select('orders', {'id': f'eq.{order_id}'})
            if not rows:
                return self._json(404, {'error': 'Pedido no encontrado.'})
            order      = order_from_db(rows[0])
            msg_type   = body.get('messageType', 'confirmacion')
            extra_note = body.get('extraNote', '').strip()
            if msg_type == 'personalizado':
                instruction = f'Redactar un mensaje según estas indicaciones del admin: {extra_note}'
            else:
                instruction = MESSAGE_TYPE_LABELS.get(msg_type, MESSAGE_TYPE_LABELS['confirmacion'])
            user_prompt = (
                f"Datos del pedido:\n"
                f"- Cliente: {order.get('customerName', 'Cliente')}\n"
                f"- Producto: {order.get('productName', 'pastel artesanal')}\n"
                f"- Cantidad: {order.get('quantity', 1)} porciones\n"
                f"- Fecha de entrega: {order.get('deliveryDate', 'por confirmar')}\n"
                f"- Zona de entrega: {order.get('zone', 'no especificada')}\n"
                f"- Estado actual: {order.get('status', 'Recibido')}\n"
                f"- Folio: {order.get('folio', '')}\n\n"
                f"Tarea: {instruction}"
            )
            text, err = call_gemini(MESSAGE_SYSTEM_PROMPT, user_prompt)
            if err:
                return self._json(500, {'error': err})
            return self._json(200, {'message': text})

        if path.startswith('/api/orders/') and path.endswith('/send-message'):
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            order_id     = path.split('/')[-2]
            rows         = sb_select('orders', {'id': f'eq.{order_id}'})
            if not rows:
                return self._json(404, {'error': 'Pedido no encontrado.'})
            order        = order_from_db(rows[0])
            message_text = body.get('message', '').strip()
            if not message_text:
                return self._json(400, {'error': 'El mensaje no puede estar vacío.'})
            ok, err = send_custom_message_email(order, message_text)
            if ok:
                return self._json(200, {'ok': True})
            return self._json(500, {'error': err or 'Error al enviar el correo.'})

        return self._json(404, {'error': 'No encontrado.'})

    # ── PATCH ────────────────────────────────────────────────────────────────

    def do_PATCH(self):
        path, _ = self._parse()
        body = self._body()

        if path.startswith('/api/social-posts/'):
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            post_id = path.split('/')[-1]
            db_map  = {
                'caption':       'caption',
                'hashtags':      'hashtags',
                'status':        'status',
                'scheduledDate': 'scheduled_date',
                'scheduledTime': 'scheduled_time',
                'imageIdea':     'image_idea',
                'bestTime':      'best_time',
            }
            patch = {db_map[k]: v for k, v in body.items() if k in db_map}
            result, code = sb_req('PATCH', 'social_posts', data=patch, params={'id': f'eq.{post_id}'})
            if code in (200, 201) and result:
                return self._json(200, social_post_from_db(result[0]))
            return self._json(500, {'error': 'Error al actualizar post.'})

        if path.startswith('/api/orders/'):
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            order_id = path.split('/')[-1]
            patch = {}
            if 'status' in body:
                patch['status'] = body['status']
                if body['status'] == 'Cancelado':
                    rows = sb_select('orders', {'id': f'eq.{order_id}'})
                    if rows:
                        cur     = rows[0]
                        advance = float(cur.get('advance_paid', 0))
                        patch.update(compute_refund(cur.get('status', ''), advance))
            if 'deliveryDate' in body:
                patch['delivery_date'] = body['deliveryDate']
            if 'notes' in body:
                patch['notes'] = body['notes']
            if 'respondedAt' in body:
                patch['responded_at'] = body['respondedAt']
            if 'address' in body:
                patch['address'] = body['address']
            if 'zone' in body:
                patch['zone'] = body['zone']
            result, code = sb_update('orders', order_id, patch)
            if code in (200, 201) and result:
                updated = order_from_db(result[0])
                if 'status' in patch:
                    try:
                        send_status_update_email(updated)
                    except Exception as e:
                        print(f'[email] {e}')
                return self._json(200, updated)
            return self._json(500, {'error': 'Error al actualizar.'})

        return self._json(404, {'error': 'No encontrado.'})

    # ── PUT ──────────────────────────────────────────────────────────────────

    def do_PUT(self):
        path, _ = self._parse()
        body = self._body()

        if path == '/api/catalog':
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            sb_delete('catalog', {'id': 'neq.null'})
            if body:
                sb_insert('catalog', [catalog_to_db(p) for p in body])
            return self._json(200, {'ok': True})

        if path == '/api/site-config':
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            for key, value in body.items():
                rows = sb_select('site_config', {'key': f'eq.{key}'})
                if rows:
                    sb_req('PATCH', 'site_config', data={'value': str(value)}, params={'key': f'eq.{key}'})
                else:
                    sb_insert('site_config', [{'key': key, 'value': str(value)}])
            return self._json(200, {'ok': True})

        return self._json(404, {'error': 'No encontrado.'})

    # ── DELETE ───────────────────────────────────────────────────────────────

    def do_DELETE(self):
        path, _ = self._parse()
        if path.startswith('/api/social-posts/'):
            if not is_admin(self.headers):
                return self._json(401, {'error': 'No autorizado.'})
            post_id = path.split('/')[-1]
            sb_delete('social_posts', {'id': f'eq.{post_id}'})
            return self._json(200, {'ok': True})
        return self._json(404, {'error': 'No encontrado.'})

    def log_message(self, fmt, *args):
        pass


import threading as _threading
def _cleanup_loop():
    while True:
        time.sleep(3600)  # cada hora
        try: cleanup_abandoned_payments()
        except Exception as _e: print(f'[cleanup] {_e}')

if __name__ == '__main__':
    _threading.Thread(target=_cleanup_loop, daemon=True).start()
    PORT = int(os.environ.get('PORT', 3000))
    seed_catalog_if_empty()
    print(f'Gerbera Bakery corriendo en http://localhost:{PORT}')
    HTTPServer(('', PORT), GerberaHandler).serve_forever()
