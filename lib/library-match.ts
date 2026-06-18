export function libraryKey(title: string, author?: string | null) {
  return `${normalizeText(title)}|${normalizeText(author ?? "")}`;
}

export function titleKey(title: string) {
  return normalizeText(title);
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
