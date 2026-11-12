"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Opens the browser's print dialog, where the document can be printed or saved as a PDF. */
export function PrintButton() {
  return (
    <Button variant="primary" icon={<Printer aria-hidden="true" />} onClick={() => window.print()}>
      Print or save as PDF
    </Button>
  );
}
