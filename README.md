# Lyricord

App web para guardar canciones con letra y acordes usando Next.js, TypeScript, Prisma, PostgreSQL y OCR con Google Cloud Vision.

## Variables de entorno

Creá un archivo `.env` tomando como base `.env.example`.

Ejemplo con valores ficticios:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
GOOGLE_APPLICATION_CREDENTIALS="C:/ruta/local/google-vision-service-account.json"
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account","project_id":"PROJECT_ID","private_key_id":"PRIVATE_KEY_ID","private_key":"PRIVATE_KEY","client_email":"SERVICE_ACCOUNT_EMAIL","client_id":"CLIENT_ID"}'
GOOGLE_CLOUD_PROJECT="PROJECT_ID"
NEXTAUTH_SECRET="GENERATE_A_LONG_RANDOM_SECRET"
NEXTAUTH_URL="http://localhost:3000"
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxx"
PASSWORD_RESET_FROM="Lyricord <no-reply@example.com>"
PASSWORD_RESET_REPLY_TO="contacto.lyricord@gmail.com"
REVENUECAT_WEBHOOK_SECRET="AUTHORIZATION_HEADER_CONFIGURADO_EN_REVENUECAT"
REVENUECAT_WEBHOOK_HMAC_SECRET="SIGNING_SECRET_HMAC_DE_REVENUECAT"
```

No subas valores reales al README ni al repo. Guardalos solo en `.env` local o en las variables de entorno del proveedor de deploy.

## Vercel

En Vercel cargá valores reales en `Project Settings > Environment Variables`.

Variables mínimas:
- `DATABASE_URL`
- `DIRECT_URL`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`
- `RESEND_API_KEY`
- `PASSWORD_RESET_FROM`
- `REVENUECAT_WEBHOOK_SECRET`
- `REVENUECAT_WEBHOOK_HMAC_SECRET`

Para recuperación de contraseña, configurá un dominio o remitente verificado en Resend y usalo en `PASSWORD_RESET_FROM`.
`PASSWORD_RESET_REPLY_TO` es opcional.

Para RevenueCat, `REVENUECAT_WEBHOOK_SECRET` debe coincidir con el valor enviado en `Authorization: Bearer ...`.
`REVENUECAT_WEBHOOK_HMAC_SECRET` debe ser el signing secret generado al activar HMAC webhook signing en RevenueCat.

Para producción en Vercel, usá `GOOGLE_APPLICATION_CREDENTIALS_JSON` con el JSON completo del service account.
La variable `GOOGLE_APPLICATION_CREDENTIALS` con ruta local queda útil para desarrollo local.

## Desarrollo local

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```
