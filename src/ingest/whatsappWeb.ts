import type { InboundMessage } from "../types.js";
import { normalizeIndianMobile } from "../util/indian.js";
import { sha256 } from "../util/text.js";

/**
 * Ingestion adapter for messages read from a signed-in WhatsApp Web tab
 * (TEST PATH — the production bridge is a read-only linked-device session, §7.3).
 *
 * A browser-side reader collects one row per rendered message. WhatsApp Web
 * exposes two stable attributes this relies on:
 *   data-id              "false_<chatJid>_<messageKey>_<participantJid>" (group messages)
 *   data-pre-plain-text  "[10:05 am, 14/09/2026] Ravi Realtor: "
 */
export interface WhatsAppWebRow {
  groupName: string;
  dataId: string | null;
  prePlainText: string | null;
  text: string;
  mediaType?: InboundMessage["mediaType"];
  isSystem?: boolean;
}

export interface ParsedWebRows {
  messages: InboundMessage[];
  skipped: Array<{ reason: string; row: WhatsAppWebRow }>;
}

const PRE = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]\.?\s?m\.?)?,\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\]\s*(.*?):\s*$/i;

export function parseWhatsAppWebRows(rows: WhatsAppWebRow[], opts: { receivedAt: Date; dateOrder?: "dmy" | "mdy" }): ParsedWebRows {
  const messages: InboundMessage[] = [];
  const skipped: ParsedWebRows["skipped"] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const ids = parseDataId(row.dataId);
    const pre = row.prePlainText ? row.prePlainText.replace(/[‎‏  ]/g, " ").match(PRE) : null;
    if (!pre && !row.isSystem) {
      skipped.push({ reason: "no timestamp (data-pre-plain-text missing)", row });
      continue;
    }

    const sentAt = pre ? toIst(pre, opts.dateOrder ?? "dmy") : opts.receivedAt;
    if (!sentAt) {
      skipped.push({ reason: "unparseable timestamp", row });
      continue;
    }

    const senderName = pre?.[8]?.trim() || null;
    // Participant JIDs ending @c.us carry the phone; @lid hides it (WhatsApp privacy ids).
    const jidPhone = ids?.participant?.endsWith("@c.us") ? normalizeIndianMobile(ids.participant.split("@")[0]) : null;
    const namePhone = senderName ? normalizeIndianMobile(senderName) : null;
    const phone = jidPhone ?? namePhone;

    const groupId = ids?.chat ? `wweb_${ids.chat.replace(/[^A-Za-z0-9]/g, "_")}` : `wweb_${sha256(row.groupName.toLowerCase()).slice(0, 12)}`;
    const messageId = ids?.key
      ? `wweb_${ids.key.replace(/[^A-Za-z0-9_-]/g, "_")}`
      : `wweb_${sha256(`${groupId}|${sentAt.toISOString()}|${senderName}|${row.text}`).slice(0, 24)}`;
    if (seen.has(messageId)) continue;
    seen.add(messageId);

    messages.push({
      messageId,
      groupId,
      groupName: row.groupName,
      senderPhone: phone ? phone.replace(/^\+/, "") : null,
      senderDisplayName: senderName,
      sentAt,
      receivedAt: opts.receivedAt,
      text: row.text.trim(),
      hasMedia: !!row.mediaType,
      mediaType: row.mediaType ?? null,
      quotedMessageId: null,
      isForwarded: false,
      forwardScore: 0,
      isSystemNotice: !!row.isSystem,
      rawPayload: { source: "whatsapp_web", dataId: row.dataId },
    });
  }
  return { messages, skipped };
}

export function parseDataId(dataId: string | null): { fromMe: boolean; chat: string; key: string; participant: string | null } | null {
  if (!dataId) return null;
  const m = dataId.match(/^(true|false)_([^_]+@[a-z.]+)_([^_]+)(?:_(.+))?$/i);
  if (!m) return null;
  return { fromMe: m[1] === "true", chat: m[2]!, key: m[3]!, participant: m[4] ?? null };
}

function toIst(m: RegExpMatchArray, order: "dmy" | "mdy"): Date | null {
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3] ?? 0);
  const ampm = m[4];
  const a = Number(m[5]);
  const b = Number(m[6]);
  const day = order === "dmy" ? a : b;
  const month = order === "dmy" ? b : a;
  let year = Number(m[7]);
  if (year < 100) year += 2000;
  if (ampm) {
    const pm = /^p/i.test(ampm);
    if (hour === 12) hour = pm ? 12 : 0;
    else if (pm) hour += 12;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}+05:30`);
  return Number.isNaN(d.getTime()) ? null : d;
}
