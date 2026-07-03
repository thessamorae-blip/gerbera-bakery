# Gerbera Bakery — Sistema de pedidos en línea

Sistema web para recibir, gestionar y rastrear pedidos de repostería artesanal. Incluye una tienda visible para clientes y un panel de administración privado.

---

## ¿Qué hace este sistema?

- **Los clientes** pueden ver el catálogo de productos, hacer un pedido y rastrear su estado con un folio
- **La administradora** tiene un panel privado para ver pedidos nuevos, cambiar su estado, gestionar el catálogo y generar contenido para redes sociales con inteligencia artificial
- Los cambios de estado se notifican al cliente por correo electrónico automáticamente
- El panel admin detecta pedidos nuevos cada 30 segundos sin necesidad de recargar la página

---

## Estructura de carpetas

```
gerbera-bakery/
├── index.html              → Página principal (carga React y la app)
├── server.py               → Servidor web en Python (maneja rutas, base de datos y correos)
├── .env                    → Variables de entorno con credenciales (nunca se sube a internet)
├── README.md               → Este archivo
└── src/
    ├── app.js              → Componente principal: rutas, portal de cliente, admin, landing
    ├── styles.css          → Estilos de toda la aplicación
    ├── catalogEditor.js    → Editor visual del catálogo de productos (solo admin)
    ├── contentEditor.js    → Editor de textos e imágenes del sitio (solo admin)
    ├── socialContent.js    → Módulo de generación de contenido para redes con IA
    ├── ordersStore.js      → Lista de los 7 estados posibles de un pedido
    ├── recipesData.js      → Recetas de los productos (ingredientes y cantidades)
    ├── materialsData.js    → Catálogo de materiales con precio unitario y categoría
    ├── shoppingList.js     → Genera la lista de compras a partir de pedidos activos
    ├── emailService.js     → Envío de correos de confirmación (actualmente no en uso activo)
    ├── utils/              → Funciones reutilizables (puras, sin estado de React)
    │   ├── formatCurrency.js    → Convierte números a pesos MXN
    │   ├── computeFullPrice.js  → Calcula el precio del pastel completo
    │   ├── authHelpers.js       → Token de admin y fetch autenticado
    │   └── orderHelpers.js      → Posición en flujo, hora estimada y conteo por estado
    └── hooks/              → Hooks de React reutilizables entre componentes
        ├── useToast.js          → Notificaciones temporales ("Guardado ✓")
        └── useFolioTracker.js   → Búsqueda y cancelación de pedidos por folio
```

---

## Variables de entorno (.env)

El archivo `.env` contiene credenciales privadas. **Nunca debe subirse a internet ni compartirse.** Cada variable sirve para lo siguiente:

| Variable | Para qué sirve |
|---|---|
| `ADMIN_PASSWORD` | Contraseña para entrar al panel de admin |
| `JWT_SECRET` | Llave secreta para firmar los tokens de sesión del admin |
| `SUPABASE_URL` | Dirección de la base de datos en Supabase |
| `SUPABASE_KEY` | Llave de acceso a la base de datos |
| `ADMIN_EMAIL` | Correo de Gerbera Bakery (desde donde se envían notificaciones) |
| `GMAIL_APP_PASSWORD` | Contraseña de aplicación de Gmail para enviar correos |
| `ANTHROPIC_API_KEY` | Llave de la API de Claude para generar contenido de redes sociales |

---

## Skills (funciones reutilizables) — `/src/utils/`

| Archivo | Función | Qué hace |
|---|---|---|
| `formatCurrency.js` | `formatCurrency(valor)` | Convierte un número a pesos mexicanos: `$1,234.00` |
| `computeFullPrice.js` | `computeFullPrice(id, precio)` | Calcula el precio del pastel completo (12 o 16 porciones) |
| `authHelpers.js` | `adminFetch(url, opciones)` | Hace peticiones al servidor con el token del admin |
| `authHelpers.js` | `authHeaders()` | Devuelve los encabezados de autenticación |
| `orderHelpers.js` | `getStatusIndex(estado)` | Devuelve la posición del estado en el flujo (0–6) |
| `orderHelpers.js` | `buildStatusCounts(pedidos)` | Cuenta pedidos por estado para el dashboard |

**En `server.py`:**

| Función | Qué hace |
|---|---|
| `call_claude(sistema, usuario)` | Llama a la API de Claude y devuelve el texto generado |
| `generate_folio()` | Genera el número de folio para cada pedido nuevo (GB-1001, GB-1002...) |
| `send_order_emails(pedido)` | Envía correos de confirmación al cliente y a la admin cuando llega un pedido |
| `send_status_update_email(pedido)` | Envía correo al cliente cuando la admin cambia el estado del pedido |
| `sb_select / sb_insert / sb_update / sb_delete` | Operaciones en la base de datos de Supabase |

---

## Hooks — `/src/hooks/`

| Archivo | Hook | Qué observa o recuerda |
|---|---|---|
| `useToast.js` | `useToast(duración)` | Muestra un mensaje temporal ("Guardado ✓") y lo borra solo. Se usa en el editor de catálogo, el editor de contenido y el módulo de redes. |
| `useFolioTracker.js` | `useFolioTracker()` | Guarda el folio que escribe el cliente, el pedido encontrado y el mensaje de resultado. Se usa en la landing page y en el portal de cliente. |

**Hooks importantes dentro de los componentes (no extraídos, están integrados):**

| Componente | Qué observa |
|---|---|
| `App` | La ruta del navegador, el catálogo, los pedidos y si el admin está autenticado |
| `AdminView` | El tab activo, el mes del calendario, pedidos nuevos sin ver |
| `SocialContent` | Los posts del calendario, el formulario de creación y el contenido generado por IA |

---

## Loops principales

| Dónde | Qué recorre | Qué genera |
|---|---|---|
| Landing page | Los productos del catálogo | Una tarjeta visual por cada pastel |
| Portal del cliente | Los productos del catálogo | Una tarjeta seleccionable por producto |
| Admin → Dashboard | Los 7 estados del flujo | Una barra de progreso por estado |
| Admin → Pedidos | Todos los pedidos filtrados | Una fila en la tabla de pedidos |
| Admin → Calendario | Las celdas del mes (Lun–Dom) | Un cuadrito por día con los pedidos del día |
| Admin → Lista de compras | Los pedidos activos → sus recetas → sus ingredientes | Una lista acumulada de todo lo que hay que comprar |
| Social → Calendario | Los posts del mes | Un punto de color en cada día con posts agendados |
| Detalle de producto | Las fotos del producto (hasta 4) | Un botón de thumbnail por foto |

---

## Cómo correr el proyecto localmente

1. Asegúrate de tener Python 3.8 o superior instalado
2. Crea o verifica el archivo `.env` con todas las variables (ver tabla arriba)
3. En la terminal, desde la carpeta del proyecto:
   ```bash
   python3 server.py
   ```
4. Abre el navegador en: `http://localhost:3000`
5. El panel de administración está en: `http://localhost:3000/gerbera-admin-2025`

---

## Notas técnicas

- La app usa **React 18 via CDN** — no hay bundler ni npm necesario
- El servidor es **Python puro** (sin frameworks externos) usando `http.server`
- La base de datos es **Supabase** (Postgres), accedida directamente desde el servidor vía REST
- La **API Key de Claude** solo vive en `.env` — nunca en el código ni en el navegador
- El token de sesión del admin se borra cada vez que se recarga la página (seguridad intencional)
