# Cancionero

App web para guardar canciones con letra y acordes usando Next.js, TypeScript, Prisma, PostgreSQL y OCR con Google Cloud Vision.

## Variables de entorno

Creá un archivo `.env` tomando como base `.env.example`.

Ejemplo:

```env
DATABASE_URL="postgresql://usuario:password@ep-tu-db-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
DIRECT_URL="postgresql://usuario:password@ep-tu-db.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
GOOGLE_APPLICATION_CREDENTIALS="C:/secrets/google-vision-service-account.json"
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account","project_id":"tu-proyecto-gcp","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n","client_email":"tu-service-account@tu-proyecto-gcp.iam.gserviceaccount.com","client_id":"..."}'
GOOGLE_CLOUD_PROJECT="tu-proyecto-gcp"
NEXTAUTH_SECRET="cambia-esto-por-un-secret-largo-y-seguro"
NEXTAUTH_URL="http://localhost:3000"
```

## Vercel

En Vercel cargá valores reales en `Project Settings > Environment Variables`.

Variables mínimas:
- `DATABASE_URL`
- `DIRECT_URL`
- `GOOGLE_CLOUD_PROJECT`
- `GOOGLE_APPLICATION_CREDENTIALS_JSON`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Para producción en Vercel, usá `GOOGLE_APPLICATION_CREDENTIALS_JSON` con el JSON completo del service account.
La variable `GOOGLE_APPLICATION_CREDENTIALS` con ruta local queda útil para desarrollo local.

## Desarrollo local

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```
