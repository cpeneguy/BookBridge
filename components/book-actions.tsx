"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui";

export function BookActions({
  bookId,
  canDelete
}: {
  bookId: string;
  canDelete: boolean;
}) {
  const router = useRouter();

  async function deleteBook() {
    const confirmed = window.confirm("Delete this wanted book?");
    if (!confirmed) return;

    const response = await fetch(`/api/books/${bookId}`, { method: "DELETE" });
    if (response.ok) {
      router.refresh();
      return;
    }

    const data = await response.json().catch(() => ({ error: "Delete failed." }));
    window.alert(data.error ?? "Delete failed.");
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        className="inline-flex h-8 items-center justify-center gap-2 rounded border border-line bg-white/[0.03] px-2 text-xs font-medium text-[#F1D48A] transition hover:bg-white/[0.06]"
        href={`/books/${bookId}`}
      >
        <ExternalLink size={14} />
        Releases
      </Link>
      <Button
        className="h-8 px-2 text-xs"
        disabled={!canDelete}
        onClick={() => void deleteBook()}
        title={canDelete ? "Delete wanted book" : "Cannot delete after a download has been sent"}
        type="button"
        variant="secondary"
      >
        <Trash2 size={14} />
        Delete
      </Button>
    </div>
  );
}
