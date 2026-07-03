"""
Adaptador de Vercel — importa el servidor Python y lo expone como función serverless.
Para desarrollo local sigue usando: python3 server.py
"""
import sys, os
from http.server import BaseHTTPRequestHandler

# Agrega el directorio raíz al path para poder importar server.py
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import GerberaHandler  # importa toda la lógica del servidor

class handler(GerberaHandler):
    """
    Vercel llama a esta clase para cada petición /api/*.
    Hereda todo el routing de GerberaHandler pero omite el inicio del servidor.
    """
    def __init__(self, *args, **kwargs):
        # Omitir SimpleHTTPRequestHandler.__init__ (para archivos estáticos)
        # ya que Vercel sirve los archivos estáticos automáticamente.
        BaseHTTPRequestHandler.__init__(self, *args, **kwargs)
