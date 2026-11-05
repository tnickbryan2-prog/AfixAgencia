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
