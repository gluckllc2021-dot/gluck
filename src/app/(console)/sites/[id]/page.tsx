"use client";

import { useParams } from "next/navigation";
import { SiteDetail } from "@/components/site-detail";

export default function Page() {
  const params = useParams<{ id: string }>();
  return <SiteDetail id={params.id} />;
}
