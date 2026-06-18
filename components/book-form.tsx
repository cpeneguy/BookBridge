"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, inputClass } from "@/components/ui";

export function BookForm() {
  const router = useRouter();

  async function submit(formData: FormData) {
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(formData.entries()))
    });

    if (response.ok) {
      router.push("/books");
      router.refresh();
    }
  }

  return (
    <form action={submit} className="grid gap-4">
      <label className="grid gap-2 text-sm text-slate-300">
        Title
        <input className={inputClass} name="title" required />
      </label>
      <label className="grid gap-2 text-sm text-slate-300">
        Author
        <input className={inputClass} name="author" required />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-300">
          Year
          <input className={inputClass} name="year" type="number" />
        </label>
        <label className="grid gap-2 text-sm text-slate-300">
          Wanted Format
          <select className={inputClass} name="formatWanted" defaultValue="audiobook">
            <option value="audiobook">Audiobook</option>
            <option value="ebook">Ebook</option>
          </select>
        </label>
      </div>
      <Button className="w-fit" type="submit">
        <Plus size={16} />
        Add to Wanted
      </Button>
    </form>
  );
}
