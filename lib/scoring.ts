import type { Book } from "@prisma/client";

export function scoreRelease({
  book,
  releaseTitle,
  format,
  protocol
}: {
  book: Pick<Book, "title" | "author" | "year">;
  releaseTitle: string;
  format: string;
  protocol?: string | null;
}) {
  const title = normalize(releaseTitle);
  const wantedTitle = normalize(book.title);
  const author = normalize(book.author);
  const warnings: string[] = [];
  let score = 0;

  if (title.includes(wantedTitle)) {
    score += 40;
  } else {
    warnings.push("Title mismatch");
  }

  if (author && title.includes(author)) {
    score += 25;
  } else {
    warnings.push("Author not found in release name");
  }

  const looksAudio = /\b(audiobook|audio|m4b|mp3|flac|unabridged)\b/i.test(releaseTitle);
  const looksEbook = /\b(epub|ebook|mobi|azw3|pdf)\b/i.test(releaseTitle);
  if ((format === "audiobook" && looksAudio) || (format === "ebook" && looksEbook)) {
    score += 15;
  } else if (format === "audiobook" && looksEbook) {
    warnings.push("Looks like an ebook");
  } else if (format === "ebook" && looksAudio) {
    warnings.push("Looks like an audiobook");
  }

  if (book.year && title.includes(String(book.year))) {
    score += 10;
  }

  if ((format === "audiobook" && protocol === "usenet") || (format === "ebook" && protocol === "torrent")) {
    score += 10;
  }

  if (/\b(comic|magazine|sample|abridged)\b/i.test(releaseTitle)) {
    warnings.push("Review release type");
    score -= 10;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    warnings
  };
}

export function scoreLabel(score?: number | null) {
  if (!score) return "Risky";
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Review";
  return "Risky";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
