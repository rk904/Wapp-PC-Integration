import { describe, expect, it } from "vitest";
import { parseDataId, parseWhatsAppWebRows } from "../src/ingest/whatsappWeb.js";

const receivedAt = new Date("2026-09-14T12:00:00+05:30");

describe("WhatsApp Web row adapter", () => {
  it("reads sender phone, group and message key from data-id and time from data-pre-plain-text", () => {
    const r = parseWhatsAppWebRows(
      [
        {
          groupName: "South Bengaluru Property Hub",
          dataId: "false_120363041234567890@g.us_3EB0A1B2C3D4E5F6_919845012345@c.us",
          prePlainText: "[10:05 am, 14/09/2026] Ravi Realtor: ",
          text: "Need 2bhk rent koramangala 35k",
        },
        {
          groupName: "South Bengaluru Property Hub",
          dataId: "false_120363041234567890@g.us_3EB0FFFF_123456789012345@lid",
          prePlainText: "[1:20 pm, 14/09/2026] +91 99000 11122: ",
          text: "",
          mediaType: "image",
        },
      ],
      { receivedAt },
    );
    expect(r.skipped).toEqual([]);
    expect(r.messages[0]).toMatchObject({
      messageId: "wweb_3EB0A1B2C3D4E5F6",
      groupId: "wweb_120363041234567890_g_us",
      senderPhone: "919845012345",
      senderDisplayName: "Ravi Realtor",
      text: "Need 2bhk rent koramangala 35k",
    });
    expect(r.messages[0]!.sentAt.toISOString()).toBe("2026-09-14T04:35:00.000Z");
    // @lid hides the number; the name shown is a number here, so it is used.
    expect(r.messages[1]).toMatchObject({ senderPhone: "919900011122", hasMedia: true, mediaType: "image" });
  });

  it("skips rows without a timestamp and de-duplicates repeated rows", () => {
    const row = { groupName: "G", dataId: "false_1@g.us_ABC_919845012345@c.us", prePlainText: "[9:00 am, 14/09/2026] A: ", text: "hi" };
    const r = parseWhatsAppWebRows([row, row, { groupName: "G", dataId: null, prePlainText: null, text: "x" }], { receivedAt });
    expect(r.messages).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
  });

  it("parses data-id shapes", () => {
    expect(parseDataId("true_120363@g.us_3EB0AA")).toEqual({ fromMe: true, chat: "120363@g.us", key: "3EB0AA", participant: null });
    expect(parseDataId("garbage")).toBeNull();
  });
});
