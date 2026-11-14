function randomHex(bytes: number) {
  const cryptoLike = globalThis.crypto as
    | {
        getRandomValues?: (array: Uint8Array) => Uint8Array;
        randomUUID?: () => string;
      }
    | undefined;

  if (typeof cryptoLike?.randomUUID === "function") {
    return cryptoLike.randomUUID().replace(/-/g, "").slice(0, bytes * 2);
  }

  if (typeof cryptoLike?.getRandomValues === "function") {
    const array = cryptoLike.getRandomValues(new Uint8Array(bytes));
    return Array.from(array, (value) => value.toString(16).padStart(2, "0")).join("");
  }

  let value = "";
  for (let index = 0; index < bytes; index += 1) {
    value += Math.floor(Math.random() * 256).toString(16).padStart(2, "0");
  }
  return value;
}

export function createLocalSongId(now = new Date()) {
  return `local_${now.getTime().toString(36)}_${randomHex(8)}`;
}
