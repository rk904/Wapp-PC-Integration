import { strFromU8, unzipSync } from "fflate";
import type { InboundMessage } from "../types.js";
import { normalizeIndianMobile } from "../util/indian.js";
import { sha256 } from "../util/text.js";

/**
 * Ingestion adapter for WhatsApp "Export chat" files (.txt, or the .zip that
 * includes media). This is the compliant manual path named in PRD §7.3: a
 * person exports a group chat and attaches it; nothing talks to WhatsApp.
 *
 * Handles Android ("14/09/26, 10:05 am - Name: text") and iOS
 * ("[14/09/26, 10:05:12 AM] Name: text") layouts, multi-line messages,
 * media placeholders and system notices. Timestamps are read as IST.
 */

export interface ParsedExport {
  groupName: string;
  messages: InboundMessage[];
  dateOrder: "dmy" | "mdy";
  skippedLines: number;
}

const ANDROID = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\s+[-–]\s+(.*)$/i;
const IOS = /^\[(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?\]\s+(.*)$/i;

const MEDIA_PATTERNS: Array<[RegExp, InboundMessage["mediaType"]]> = [
  [/^<media omitted>$/i, "image"],
  [/^(image|photo) omitted$/i, "image"],
  [/^video omitted$/i, "video"],
  [/^(audio|voice message|ptt) omitted$/i, "audio"],
  [/^sticker omitted$/i, "sticker"],
  [/^(document|gif) omitted$/i, "document"],
  [/^<attached: [^>]*\.(jpe?g|png|webp|heic)>$/i, "image"],
  [/^<attached: [^>]*\.(mp4|mov)>$/i, "video"],
  [/^<attached: [^>]*\.(opus|m4a|mp3|aac)>$/i, "audio"],
  [/^<attached: [^>]*>$/i, "document"],
  [/^.*\.(pdf|docx?|xlsx?) \(file attached\)$/i, "document"],
];

interface RawEntry {
  d1: number;
  d2: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  ampm: string | undefined;
  body: string;
}

export function parseWhatsAppExport(
  input: { fileName: string; data: Uint8Array },
  opts: { groupName?: string; groupId?: string; receivedAt: Date },
): ParsedExport {
  const { text, innerName } = readExportText(input.fileName, input.data);
  const groupName = opts.groupName?.trim() || groupNameFrom(innerName ?? input.fileName);

  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const entries: RawEntry[] = [];
  let skipped = 0;

  for (const rawLine of lines) {
    const line = rawLine.replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/ | /g, " ");
    const m = line.match(IOS) ?? line.match(ANDROID);
    if (m) {
      entries.push({
        d1: Number(m[1]),
        d2: Number(m[2]),
        year: Number(m[3]),
        hour: Number(m[4]),
        minute: Number(m[5]),
        second: Number(m[6] ?? 0),
        ampm: m[7],
        body: m[8] ?? "",
      });
    } else if (entries.length > 0) {
      entries[entries.length - 1]!.body += `\n${line}`;
    } else if (line.trim()) {
      skipped++;
    }
  }

  // India exports are day-first; switch only when the data proves month-first.
  const dateOrder: "dmy" | "mdy" = entries.some((e) => e.d2 > 12) && !entries.some((e) => e.d1 > 12) ? "mdy" : "dmy";
  const groupId = opts.groupId ?? `export_${sha256(groupName.toLowerCase()).slice(0, 12)}`;
  const seen = new Map<string, number>();
  const messages: InboundMessage[] = [];

  for (const e of entries) {
    const sentAt = toIst(e, dateOrder);
    if (!sentAt) {
      skipped++;
      continue;
    }
    const { sender, text: bodyText, isSystem } = splitSender(e.body);
    const trimmed = bodyText.trim();
    const media = MEDIA_PATTERNS.find(([re]) => re.test(trimmed));
    const deleted = /^(this message was deleted|you deleted this message|null)$/i.test(trimmed);
    const phone = sender ? normalizeIndianMobile(sender) : null;

    const base = `${groupId}|${sentAt.toISOString()}|${sender ?? "system"}|${trimmed}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);

    messages.push({
      messageId: `exp_${sha256(`${base}|${n}`).slice(0, 24)}`,
      groupId,
      groupName,
      senderPhone: phone ? phone.replace(/^\+/, "") : null,
      senderDisplayName: sender,
      sentAt,
      receivedAt: opts.receivedAt,
      text: media || deleted ? "" : trimmed,
      hasMedia: !!media,
      mediaType: media?.[1] ?? null,
      quotedMessageId: null,
      isForwarded: false,
      forwardScore: 0,
      isSystemNotice: isSystem || deleted,
      rawPayload: { source: "whatsapp_export", fileName: input.fileName },
    });
  }
  return { groupName, messages, dateOrder, skippedLines: skipped };
}

function readExportText(fileName: string, data: Uint8Array): { text: string; innerName: string | null } {
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  if (!isZip) return { text: strFromU8(data), innerName: null };
  const files = unzipSync(data, { filter: (f) => f.name.toLowerCase().endsWith(".txt") });
  const names = Object.keys(files);
  const chosen = names.find((n) => /_chat\.txt$/i.test(n)) ?? names.find((n) => /whatsapp chat/i.test(n)) ?? names[0];
  if (!chosen) throw new Error(`${fileName} does not contain a WhatsApp chat .txt file`);
  return { text: strFromU8(files[chosen]!), innerName: /_chat\.txt$/i.test(chosen) ? fileName : chosen };
}

function groupNameFrom(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  return (
    base
      .replace(/\.(txt|zip)$/i, "")
      .replace(/^WhatsApp Chat (with|-)\s*/i, "")
      .replace(/\s*\(\d+\)$/, "")
      .trim() || "Imported WhatsApp group"
  );
}

function splitSender(body: string): { sender: string | null; text: string; isSystem: boolean } {
  const firstLine = body.split("\n")[0] ?? "";
  const idx = firstLine.indexOf(": ");
  if (idx > 0 && idx < 60) {
    return { sender: body.slice(0, idx).trim(), text: body.slice(idx + 2), isSystem: false };
  }
  // A timestamped line with no "Name: " prefix is always a WhatsApp system notice.
  return { sender: null, text: body, isSystem: true };
}

function toIst(e: RawEntry, order: "dmy" | "mdy"): Date | null {
  const day = order === "dmy" ? e.d1 : e.d2;
  const month = order === "dmy" ? e.d2 : e.d1;
  const year = e.year < 100 ? 2000 + e.year : e.year;
  let hour = e.hour;
  if (e.ampm) {
    const pm = /^p/i.test(e.ampm);
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || e.minute > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(e.minute)}:${pad(e.second)}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}
