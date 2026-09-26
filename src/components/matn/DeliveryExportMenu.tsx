import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/lib/i18n";
import { buildXlsx } from "@/lib/export/xlsx";
import {
  buildDeliveryReportHtml,
  buildDeliverySheets,
  exportedDeliverables,
  exportFileName,
  type ExportVariant,
} from "@/lib/delivery/delivery-export";
import type { DeliverySchedulePayload } from "@/lib/delivery/deliverables.server";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function download(bytes: Uint8Array, fileName: string) {
  const blob = new Blob([bytes.slice().buffer], { type: XLSX_MIME });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

/** Excel and PDF (print) exports of the delivery schedule, internal and client versions. */
export function DeliveryExportMenu({ schedule }: { schedule: DeliverySchedulePayload }) {
  const { t, dir } = useI18n();

  function context(variant: ExportVariant) {
    if (variant === "client" && exportedDeliverables(schedule, "client").length === 0) {
      toast.info(t("dl.export.clientEmpty"));
      return null;
    }
    return { schedule, variant, t, dir, generatedAt: new Date().toISOString() };
  }

  function excel(variant: ExportVariant) {
    const ctx = context(variant);
    if (!ctx) return;
    const name = exportFileName(schedule.projectName, variant, ctx.generatedAt.slice(0, 10));
    download(buildXlsx(buildDeliverySheets(ctx)), `${name}.xlsx`);
  }

  function pdf(variant: ExportVariant) {
    const ctx = context(variant);
    if (!ctx) return;
    const win = window.open("", "_blank");
    if (!win) {
      toast.error(t("dl.export.popupBlocked"));
      return;
    }
    win.document.open();
    win.document.write(buildDeliveryReportHtml(ctx));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="size-3.5" />
          {t("dl.export.button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => excel("internal")}>
          {t("dl.export.excelInternal")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pdf("internal")}>
          {t("dl.export.pdfInternal")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => excel("client")}>
          {t("dl.export.excelClient")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => pdf("client")}>
          {t("dl.export.pdfClient")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
