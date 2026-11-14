# Lyricord Mobile

Primer prototipo de lectura para iOS y Android con Expo.

## Configuración local

1. Copiá `.env.example` como `.env.local`.
2. Configurá `EXPO_PUBLIC_API_URL` con la URL de la web/API.
3. En un teléfono real conectado a la misma red, usá la IP LAN de la computadora, por ejemplo `http://192.168.1.20:3000`. `localhost` apuntaría al teléfono.
4. Iniciá la web desde la raíz con `npx next dev -H 0.0.0.0`.
5. Iniciá Expo desde este directorio con `npm start` y escaneá el QR con Expo Go.

La base del servidor debe tener aplicada la migración aditiva `20260808120000_add_mobile_sessions` y el servidor debe definir un `MOBILE_AUTH_SECRET` distinto de `NEXTAUTH_SECRET`, con al menos 32 caracteres.

No pongas secretos en variables `EXPO_PUBLIC_*`: quedan incluidos en la aplicación.
