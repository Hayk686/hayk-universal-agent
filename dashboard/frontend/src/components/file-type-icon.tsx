import {
  FileText,
  FileJson,
  FileCode,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File as FileIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

const MAP: Record<string, { icon: LucideIcon; tone: string }> = {
  md: { icon: FileText, tone: "text-primary" },
  txt: { icon: FileText, tone: "text-muted-foreground" },
  json: { icon: FileJson, tone: "text-warning" },
  csv: { icon: FileSpreadsheet, tone: "text-success" },
  xlsx: { icon: FileSpreadsheet, tone: "text-success" },
  pdf: { icon: FileText, tone: "text-destructive" },
  html: { icon: FileCode, tone: "text-info" },
  js: { icon: FileCode, tone: "text-warning" },
  ts: { icon: FileCode, tone: "text-info" },
  py: { icon: FileCode, tone: "text-info" },
  png: { icon: FileImage, tone: "text-primary" },
  jpg: { icon: FileImage, tone: "text-primary" },
  zip: { icon: FileArchive, tone: "text-muted-foreground" },
};

export function FileTypeIcon({ ext, className }: { ext: string; className?: string }) {
  const cfg = MAP[ext.toLowerCase()] ?? { icon: FileIcon, tone: "text-muted-foreground" };
  const Icon = cfg.icon;
  return <Icon className={cn("h-4 w-4", cfg.tone, className)} />;
}
