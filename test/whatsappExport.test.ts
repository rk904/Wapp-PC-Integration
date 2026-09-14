import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { parseWhatsAppExport } from "../src/ingest/whatsappExport.js";

const receivedAt = new Date("2026-09-14T12:00:00+05:30");

describe("WhatsApp chat export adapter", () => {
  it("parses Android exports with multi-line messages, media and system notices", () => {
    const txt = [
      "14/09/26, 9:58 am - Messages and calls are end-to-end encrypted. No one outside of this chat can read them.",
      "14/09/26, 10:05 am - Ravi Realtor: Urgent requirement 3 BHK semi furnished flat",
      "in Electronic City Phase 1, budget 45-50k",
      "14/09/26, 10:06 am - +91 98450 12345: <Media omitted>",
      "14/09/26, 1:15 pm - Suresh added Ramesh",
      "14/09/26, 1:20 pm - +91 99000 11122: Need 2bhk rent koramangala 35k",
    ].join("\n");
    const r = parseWhatsAppExport({ fileName: "WhatsApp Chat with South Bengaluru Property Hub.txt", data: strToU8(txt) }, { receivedAt });

    expect(r.groupName).toBe("South Bengaluru Property Hub");
    expect(r.messages).toHaveLength(5);
    expect(r.messages[0]!.isSystemNotice).toBe(true);
    expect(r.messages[1]).toMatchObject({ senderDisplayName: "Ravi Realtor", senderPhone: null, text: "Urgent requirement 3 BHK semi furnished flat\nin Electronic City Phase 1, budget 45-50k" });
    expect(r.messages[1]!.sentAt.toISOString()).toBe("2026-09-14T04:35:00.000Z");
    expect(r.messages[2]).toMatchObject({ hasMedia: true, mediaType: "image", text: "", senderPhone: "919845012345" });
    expect(r.messages[3]!.isSystemNotice).toBe(true);
    expect(r.messages[4]).toMatchObject({ senderPhone: "919900011122", text: "Need 2bhk rent koramangala 35k" });
    expect(r.messages[4]!.sentAt.toISOString()).toBe("2026-09-14T07:50:00.000Z");
  });

  it("parses iOS exports inside a zip, and message ids are stable across re-imports", () => {
    const txt = "[14/09/2026, 10:05:12 AM] Ravi Realtor: Need 2bhk rent koramangala 35k\n[14/09/2026, 10:07:00 AM] Ravi Realtor: ‎image omitted";
    const zip = zipSync({ "_chat.txt": strToU8(txt), "00000012-PHOTO.jpg": new Uint8Array([1, 2, 3]) });
    const a = parseWhatsAppExport({ fileName: "WhatsApp Chat - Whitefield Brokers.zip", data: zip }, { receivedAt });
    const b = parseWhatsAppExport({ fileName: "WhatsApp Chat - Whitefield Brokers.zip", data: zip }, { receivedAt: new Date() });

    expect(a.groupName).toBe("Whitefield Brokers");
    expect(a.messages).toHaveLength(2);
    expect(a.messages[0]!.sentAt.toISOString()).toBe("2026-09-14T04:35:12.000Z");
    expect(a.messages[1]).toMatchObject({ hasMedia: true, text: "" });
    expect(a.messages.map((m) => m.messageId)).toEqual(b.messages.map((m) => m.messageId));
  });

  it("detects month-first exports only when the dates prove it", () => {
    const txt = "9/25/26, 10:05 AM - Ravi: Need 2bhk rent koramangala 35k";
    const r = parseWhatsAppExport({ fileName: "chat.txt", data: strToU8(txt) }, { receivedAt });
    expect(r.dateOrder).toBe("mdy");
    expect(r.messages[0]!.sentAt.toISOString()).toBe("2026-09-25T04:35:00.000Z");
  });
});
