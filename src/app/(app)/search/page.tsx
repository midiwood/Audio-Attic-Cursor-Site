import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Legacy route — search now lives in the browse filters panel. */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const part of value) next.append(key, part);
    } else {
      next.set(key, value);
    }
  }
  const query = next.toString();
  redirect(query ? `/?${query}` : "/");
}
