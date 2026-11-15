export function formatLibraryLimit(value: number | null | undefined) {
  if (value === undefined) return "Cargando...";
  return value === null
    ? "Sin límite"
    : `Hasta ${value} canciones y versiones`;
}

export function formatImageImportLimit(value: number | null | undefined) {
  if (value === undefined) return "Cargando...";
  return value === null ? "Sin límite" : `${value} veces en total`;
}
