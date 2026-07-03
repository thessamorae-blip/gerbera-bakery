# Project Context

Gerbera Bakery es un sistema de pedidos en línea para repostería artesanal: una tienda donde el cliente ve el catálogo, hace su pedido y le da seguimiento con un folio, y un panel privado donde la administradora gestiona esos pedidos y el contenido del sitio.

El detalle técnico completo (carpetas, variables de entorno, funciones, hooks) ya está documentado en [README.md](README.md) — esa es la fuente de verdad técnica, no se repite aquí.

**Visión importante para decisiones futuras:** aunque hoy el negocio es repostería, la idea es que el sistema esté armado de forma **estandarizada y reutilizable**, para poder adaptarlo después a otro tipo de producto o industria (no solo pasteles) sin tener que reescribirlo desde cero. Esto debe pesar en cómo se toman decisiones de diseño: preferir que lo específico del producto (nombres, categorías, precios, recetas/insumos) viva en datos/configuración separados de la lógica de pedidos, autenticación, notificaciones, etc., en vez de quedar mezclado o "hardcodeado" en el código.

# About Me

Soy la dueña de Gerbera Bakery, no soy programadora — mi nivel técnico es de principiante. Uso Claude Code como mi desarrollador principal para construir y mantener esta app.

Cómo prefiero que trabajemos:
- Explicaciones simples, evitando jerga técnica; si algo técnico es inevitable, explica en una frase qué hace y por qué importa.
- Antes de cambios grandes o riesgosos, avísame en términos de "qué va a cambiar para mí como usuaria/dueña", no solo en términos de código.
- Como me interesa poder reutilizar este sistema para otros productos/industrias más adelante, si una solución rápida específica de repostería choca con esa meta de reutilización, dime el trade-off para que yo decida.

# Project Structure

Para la estructura de carpetas y archivos, ver [README.md](README.md) (sección "Estructura de carpetas") — se mantiene ahí para no duplicar y evitar que se desactualice.

A nivel de producto, así se debe ver/sentir la app (pensado para que aplique a repostería hoy y a otro producto/industria después):

- **Landing pública / vitrina de catálogo** — muestra los productos (o servicios) de forma atractiva y sin necesidad de crear cuenta; es la puerta de entrada para cualquier cliente nuevo.
- **Portal del cliente** — permite armar y confirmar un pedido, y darle seguimiento después con un folio/código, sin necesidad de registrarse ni recordar contraseña.
- **Panel de administración (pedidos)** — bandeja con los pedidos entrantes, su estado (flujo de varios pasos) y aviso de pedidos nuevos, para que la administradora nunca tenga que refrescar manualmente para enterarse.
- **Gestión de contenido sin tocar código** — desde el mismo panel se edita el catálogo (productos/servicios, precios, fotos) y los textos/imágenes del sitio, para que cualquier cambio de negocio no dependa de programar.
- **Capa de datos configurable** — lo específico del producto (nombres, categorías, precios, recetas/insumos) vive separado de la lógica general (pedidos, autenticación, notificaciones), que es justo lo que permite adaptar el sistema a otro producto o industria más adelante sin reescribir todo.

# Tech Stack

- **Frontend**: React 18 cargado vía CDN directamente en [index.html](index.html) — no hay bundler ni build step, no se necesita `npm install` para el frontend.
- **Backend activo**: [server.py](server.py) — Python puro (`http.server`), sin frameworks externos. Es el servidor que se usa (`npm start` corre `python3 server.py`).
- **Base de datos**: Supabase (Postgres), accedida directo desde `server.py` vía REST (funciones `sb_select/sb_insert/sb_update/sb_delete`).
- **Autenticación admin**: contraseña (`ADMIN_PASSWORD`) + token JWT (`JWT_SECRET`); el token se borra al recargar la página (es intencional, no un bug).
- **Correo**: se envía por Gmail SMTP (`GMAIL_APP_PASSWORD` + `ADMIN_EMAIL`) al confirmar pedidos y al cambiar su estado.
- **IA**: API de Claude (`ANTHROPIC_API_KEY`) para generar contenido de redes sociales en el panel admin.
- **Cómo correr localmente**: `python3 server.py`, luego abrir `http://localhost:3000`. El panel admin vive en la ruta de `ADMIN_PATH` (por defecto `/gerbera-admin-2025`).

**Nota de estado, no una regla:** en el repo hay restos de un camino técnico que ya no es el activo — [server.js](server.js) (Express/JWT) no se usa (el `start` script corre `server.py`), y las variables `RESEND_API_KEY`/`RESEND_FROM_EMAIL` en `.env` no se leen en ningún lado del código (el envío real de correo usa Gmail). No los borres sin preguntarme primero, pero no asumas que están activos.

# Rules

Reglas para trabajar en este proyecto (aplican tanto a mí como a Claude):

1. **No romper el patrón "sin build step".** El frontend es React vía CDN a propósito — no introducir un bundler (Vite, webpack, etc.) ni convertir esto en un proyecto npm de verdad sin discutirlo conmigo primero.
2. **No mezclar lo específico del producto con la lógica general.** Nombres de productos, categorías, precios, recetas/insumos van en archivos de datos (`recipesData.js`, `materialsData.js`, catálogo) — nunca "hardcodeados" dentro de la lógica de pedidos, autenticación o notificaciones. Esto es lo que hace posible reusar el sistema para otro producto/industria después.
3. **Nunca commitear ni exponer `.env` ni sus valores.** Contiene contraseñas y llaves reales (Supabase, Gmail, Anthropic, JWT). Si hace falta una variable nueva, agrégala también a `.env.example` sin el valor real.
4. **Todo cambio de estado de un pedido debe seguir generando su notificación por correo al cliente.** Es una promesa implícita del negocio, no solo una función técnica.
5. **El panel admin es privado por diseño** — cualquier ruta o dato nuevo del lado admin debe quedar detrás de la autenticación existente, no expuesto en las rutas públicas.
6. **Antes de un cambio grande o riesgoso** (tocar autenticación, borrar datos, cambiar la estructura de la base de datos), explícamelo en términos de "qué cambia para mí como dueña", sin asumir que entiendo la jerga técnica, y espera mi confirmación.
7. **Si el README.md queda desactualizado por un cambio** (carpeta nueva, función nueva, variable de entorno nueva), actualízalo en el mismo cambio — es la fuente de verdad técnica y no debe quedar atrás del código.
8. **Ante una decisión rápida que resuelva algo solo para repostería pero cierre la puerta a reusar el sistema en otro producto**, dime el trade-off explícitamente antes de tomarla por mí.
9. **Priorizar siempre opciones sin costo para integraciones y servicios nuevos** (APIs, librerías, hosting, correo, etc.) — igual que ya se hizo con Supabase, Gmail SMTP y React vía CDN. Si la mejor opción sin costo tiene límites (de uso, funcionalidad, etc.), está bien: prefiero eso a pagar, y quiero saber cuáles son esos límites.
10. **Si la única forma de resolver algo bien implica una integración con costo, no la asumas ni la contrates por tu cuenta.** Detente, explícame por qué hace falta y cuánto costaría en términos simples, y dame alternativas gratuitas o de menor alcance (aunque sean más limitadas) para que yo decida cómo seguir.
11. **Siempre preguntar para clarificar antes de ejecutar una actividad compleja** Hazme preguntas para aclarar y aprobar el camino a seguir
12. **Muestrame y explicame en terminos simples tu plan y pasos antes de ejecutar** considerando que yo no sé programar