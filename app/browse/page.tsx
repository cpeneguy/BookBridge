import { SearchWorkspace } from "@/components/search-workspace";
import { PageHeader } from "@/components/ui";

export default function BrowsePage() {
  return (
    <>
      <PageHeader title="Browse" description="Discover newly released popular books, search for a specific title, and request ebook or audiobook releases." />
      <SearchWorkspace />
    </>
  );
}
