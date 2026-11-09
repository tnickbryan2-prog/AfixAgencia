# Solicitudes de trabajo · Agencia Afix

| Vista | Archivo | Quién | Acceso |
|---|---|---|---|
| Formulario | `index.html` | Gerencia, DH y áreas | Libre. Solo pueden **enviar**; no ven otras solicitudes. |
| Bandeja | `admin.html` | Coordinador (Marketing) | Mismo usuario y contraseña del panel de vouchers. |

- Datos en Supabase, tabla `public.solicitudes` (mismo proyecto que vouchers). Lectura y edición solo para correos en `admin_emails`.
- Aviso por correo con FormSubmit a `NOTIFY_EMAIL` (`config.js`). La primera solicitud dispara un correo de activación de FormSubmit: hay que confirmarlo una vez.
- Estados: Recibida → En evaluación → Formalizada → En curso → Entregada (o Rechazada).
- "Enviar solicitud formal al equipo" marca la solicitud como Formalizada y genera el texto para pegar en el proyecto del Coordinador.
