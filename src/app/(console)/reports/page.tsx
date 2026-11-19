"use client";

import { Suspense } from "react";
import { ReportsView } from "@/components/reports-views";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportsView />
    </Suspense>
  );
}
