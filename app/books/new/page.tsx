import { BookForm } from "@/components/book-form";
import { Card, PageHeader } from "@/components/ui";

export default function NewBookPage() {
  return (
    <>
      <PageHeader title="Manual Add" description="Create a wanted ebook or audiobook entry without metadata lookup." />
      <Card className="max-w-2xl p-4">
        <BookForm />
      </Card>
    </>
  );
}
