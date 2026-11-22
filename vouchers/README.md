# Registro de Vouchers · Afix Sodimac

Sistema web para que las promotoras registren vouchers (foto + datos del cliente) y el equipo de Marketing los revise.

| Vista | Archivo | Quién la usa | Acceso |
|---|---|---|---|
| Registro | `index.html` | Promotoras (celular) | Libre, sin login. Solo pueden **enviar** datos; no ven nada de lo registrado. |
| Admin | `admin.html` | Marketing Artecola | Correo y contraseña. Ve todos los registros, fotos, KPIs, filtros y exporta a Excel. |

**Stack:** GitHub Pages (hosting gratis) + Supabase (base de datos Postgres + almacenamiento privado de fotos, plan gratis: 500 MB de BD y 1 GB de fotos ≈ 3.000–5.000 vouchers).

---

## Puesta en marcha (≈ 20 minutos)

### 1. Crear la base de datos en Supabase
1. Entra a <https://supabase.com> → **Start your project** → crea una cuenta (puedes usar GitHub).
2. **New project** → nombre `vouchers-sodimac`, región **South America (São Paulo)**, guarda la contraseña de la BD.
3. Menú izquierdo → **SQL Editor** → **New query**.
4. Abre `supabase/schema.sql`, **cambia `tu-correo@artecola.com` por tu correo**, pega todo y pulsa **Run**.
5. **Authentication → Users → Add user → Create new user**: tu mismo correo + una contraseña segura (marca *Auto Confirm User*). Ese es tu acceso admin.
6. **Authentication → Sign In / Providers**: desactiva **Allow new users to sign up** (nadie más puede crearse cuenta).
7. **Project Settings → API**: copia **Project URL** y la clave **anon public**.

> Para dar acceso a otra persona del equipo: crea su usuario (paso 5) y agrega su correo en la tabla:
> `insert into admin_emails (email) values ('otra.persona@artecola.com');`

### 2. Configurar la app
Edita `config.js`:
```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
TIENDAS: ["Sodimac San Miguel", "Sodimac Atocongo", ...]   // tus 15 tiendas
```
La clave *anon* es pública por diseño: la seguridad la ponen las políticas del paso 1 (las promotoras solo pueden insertar).

### 3. Publicar en GitHub Pages
1. En <https://github.com> → **New repository** → nombre `vouchers-sodimac` → **Public** → Create.
2. **Add file → Upload files** → arrastra todos los archivos de esta carpeta (incluida la carpeta `supabase`) → **Commit changes**.
3. **Settings → Pages** → *Source*: **Deploy from a branch** → Branch `main` / `(root)` → **Save**.
4. En 1–2 minutos tendrás:
   - Registro (para promotoras): `https://TU-USUARIO.github.io/vouchers-sodimac/`
   - Admin (para ti): `https://TU-USUARIO.github.io/vouchers-sodimac/admin.html`

> Tip: convierte el link de registro en un código QR y pégalo en el kit de cada promotora. En el celular, “Agregar a pantalla de inicio” deja la app como ícono.

---

## Modo demo
Mientras `config.js` tenga los valores `TU-PROYECTO` / `TU-ANON-KEY`, la app funciona en **modo demo**: guarda en el navegador y el admin acepta cualquier contraseña. Sirve para probar el flujo antes de conectar Supabase.

## Qué valida el registro
- Foto obligatoria (se comprime a máx. 1600 px antes de subir → rápido con datos móviles).
- Nombre y apellido (se guardan con mayúscula inicial).
- Celular peruano: 9 dígitos que empiezan con 9.
- Tienda y nombre de la promotora (se recuerdan en el celular para no reescribirlos).

## Panel admin
- KPIs: total, hoy, tiendas activas, teléfonos repetidos (alerta de posibles duplicados).
- Ranking por tienda y por promotora.
- Búsqueda por nombre/teléfono, filtros por tienda, promotora y rango de fechas.
- Foto ampliable de cada voucher; eliminación de registros.
- Exportar a CSV (separador `;`, abre directo en Excel en español).

## Estructura
```
index.html          Vista de registro (promotoras)
admin.html          Vista admin
config.js           ← lo único que se edita
api.js              Conexión a Supabase / modo demo
styles.css          Estilos (paleta Artecola)
supabase/schema.sql Tabla, bucket de fotos y seguridad
```

---

## Share of Shelf por foto (pestaña "📸 Nuevo análisis")

| Vista | Archivo | Quién | Acceso |
|---|---|---|---|
| Nuevo análisis | `sos.html` | Promotoras | Libre. Solo **envían** fotos y datos de la góndola; no ven resultados. |
| Share of Shelf (Nuevo análisis, Reporte, Historial, Configuración) | `sos-admin.html`, dentro de `admin.html` → pestaña **📸 Share of Shelf** | Administrador | Mismo usuario del panel de vouchers (`admin_emails`). |

- **Base de datos:** tablas `sos_analisis` (envíos y resultados) y `sos_config` (marcas propias/rivales, meta, catálogo POP, modelo); bucket privado `sos` para las fotos.
- **Modo actual: Analizador en claude.ai** (sin API). Cada envío guarda además una copia de las fotos en base64 (`sos_fotos`); el Analizador (artefacto en claude.ai, usa el plan de Claude y el conector de Supabase) toma la cola, analiza y guarda el resultado en `sos_analisis`.
- **IA automática (opcional):** Edge Function `sos-analizar` (código en `supabase/functions/sos-analizar/`). Lee las fotos, llama a la API de Claude y guarda el resultado. Se activa sola al agregar el secreto `ANTHROPIC_API_KEY` en Supabase → Edge Functions → Secrets; sin él, deja los envíos en cola.
- **Límites:** cada envío de promotora se analiza una sola vez; máximo de análisis por hora configurable. El admin puede reintentar o reanalizar.

---

## Ventas Sodimac por SKU y pestaña "Análisis tiendas"

- **Carga:** admin → pestaña **Análisis tiendas** → botón **📥 Cargar Excel** (o la tarjeta *Ventas Sodimac por SKU y tienda* al final). Se sube el Excel crudo mensual (hoja tipo `DATA VS PROM`: una fila por tienda × SKU).
  - Columnas reconocidas: `Tienda` (ej. `2 - Sodimac San Miguel`), `SKU`, `Descripción Producto`, `Cod. Tienda`, `Afix`, `Activo` (las filas con `No` se ignoran).
  - Meses abreviados antes de `Total general`/`Promedio` (Ene, Feb, … Sept, Oct) = venta mensual **Oatey** por SKU Sodimac. Se ordenan por calendario aunque vengan desordenados.
  - Meses con nombre completo después de `Promedio` (Octubre, Noviembre, de la hoja AVANCE AFIX) = venta **Afix** del producto equivalente (avance a la fecha de corte).
  - El último mes se marca como **parcial** si vende menos del 60% de la mediana; se puede corregir en la vista previa antes de guardar.
- **Guardado:** tabla `ventas_cargas` (Supabase, solo admins). Cada carga queda en el historial y se puede eliminar.
- **Análisis tiendas (Afix vs. Oatey):** Afix del mes como % del mes promedio Oatey y participación estimada, resumen automático, gráfico mensual de ambas marcas, activación vs. tiendas sin activación (según `TIENDAS` de `config.js`), comparativo por tienda y por producto, mapa tienda × producto, combinaciones donde Afix no vende y Oatey sí, y exportación CSV.

---

## Historiales (no se elimina nada)

- **Precios → Historial de relevamientos:** todos los relevamientos de todas las semanas, agrupados por fecha, con filtros Desde/Hasta, Tienda y Marca. Clic en una fila → precios de ese relevamiento. **Evolución de precios por fin de semana:** precio efectivo promedio por SKU y marca en los últimos 8 fines de semana.
- Los relevamientos de precios **no se pueden eliminar** (la política de borrado en `precios_competencia` está desactivada: `using (false)`). Los errores se corrigen con el lápiz ✎; quedan `editado_por`, `editado_at` y `valor_original`.
- **Share of Shelf → Historial:** vistas **📅 Por fecha** (auditorías de cada día con cambio vs. la visita anterior de esa tienda), **🏬 Por tienda** (línea de tiempo de visitas con SoS y score) y **📋 Lista**; filtro de periodo con **rango de fechas**.
