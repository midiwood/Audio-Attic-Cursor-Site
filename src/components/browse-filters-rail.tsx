"use client";

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { FiltersRail } from "@/components/filters-rail";
import { defaultSortDir } from "@/lib/catalog-sort";

function countListParam(params: URLSearchParams, key: string): number {
  const seen = new Set<string>();
  for (const part of params.getAll(key)) {
    for (const piece of part.split(",")) {
      const trimmed = piece.trim();
      if (trimmed) seen.add(trimmed);
    }
  }
  return seen.size;
}

export function BrowseFiltersRail({ children }: { children: ReactNode }) {
  const params = useSearchParams();
  const activeCount = useMemo(() => {
    let count = 0;
    if (params.get("q")) count += 1;
    const license = params.get("license");
    if (license && license !== "all") count += 1;
    const samro = params.get("samro");
    if (samro === "yes" || samro === "no" || samro === "prepare") count += 1;
    for (const key of ["genre", "mood", "instrument", "attribute", "year"]) {
      count += countListParam(params, key);
    }
    const sortParam = params.get("sort");
    const sort =
      sortParam === "title" || sortParam === "year" || sortParam === "bpm" || sortParam === "date"
        ? sortParam
        : "date";
    const dirParam = params.get("dir");
    const dir = dirParam === "asc" || dirParam === "desc" ? dirParam : defaultSortDir(sort);
    if (sort !== "date" || dir !== defaultSortDir("date")) count += 1;
    return count;
  }, [params]);

  return <FiltersRail activeCount={activeCount}>{children}</FiltersRail>;
}
