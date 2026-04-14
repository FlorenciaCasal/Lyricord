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

Para producción en Vercel, usá `GOOGLE_APPLICATION_CREDENTIALS_JSON` con el JSON completo del service account.
La variable `GOOGLE_APPLICATION_CREDENTIALS` con ruta local queda útil para desarrollo local.

## Desarrollo local

```bash
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```
