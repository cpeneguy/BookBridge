import { notFound } from "next/navigation";
import { BookDetailView } from "@/components/book-detail-view";

export const dynamic = "force-dynamic";

export default async function BookDetailQueryPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  if (!id) notFound();
  return <BookDetailView id={id} />;
}
