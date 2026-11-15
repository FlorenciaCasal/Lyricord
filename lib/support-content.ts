export const CURRENT_SUPPORT_EMAIL = "contacto.lyricord@gmail.com";

export const SUPPORT_FAQS = [
  {
    question: "¿Necesito una cuenta para usar Musum?",
    answer:
      "No. Podés crear, editar y tocar tus canciones sin iniciar sesión. La cuenta te permite respaldar y sincronizar tu repertorio, importar desde imágenes y recuperar Premium.",
  },
  {
    question: "¿Cómo importo una canción desde imágenes?",
    answer:
      "Importá una captura por vez. Si agregás otra, el texto se suma debajo del anterior y podés corregir la letra y los acordes antes de guardar.",
  },
  {
    question: "¿Cómo restauro una compra Premium?",
    answer:
      "Iniciá sesión con tu cuenta de Musum, abrí Premium y elegí Restaurar compras. Usá el mismo Apple ID con el que hiciste la compra.",
  },
  {
    question: "¿Qué pasa con mis canciones si no tengo conexión?",
    answer:
      "Tu biblioteca se guarda en el dispositivo y sigue disponible sin conexión. Si iniciaste sesión, Musum vuelve a respaldar los cambios cuando recupera Internet.",
  },
] as const;

export const SUPPORT_LEGAL_LINKS = [
  { href: "/terms", label: "Términos de uso" },
  { href: "/privacy", label: "Política de privacidad" },
] as const;
