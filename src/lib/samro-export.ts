import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getSamroSubmission } from "@/lib/samro-submissions";
import { attachSamroComposerSlots } from "@/lib/composers";
import { getTracksByIds } from "@/lib/queries";
import {
  assessSamroReadiness,
  SAMRO_MAX_RIGHTS_HOLDERS,
  type SamroComposerSlot,
  type SamroProProfile,
} from "@/lib/samro";
import { toTrackListItem } from "@/lib/track-list-item";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "data/templates/SAMRO_NotificationOfWorks.xlsx",
);

const SHEET = "NotificationOfWorksReturnForm";
/** First data row after EXAMPLE / TOP OF LIST markers in the SAMRO template. */
const DATA_START_ROW = 13;
/** Rights holder block: Capacity, Name, Perf Share %, Society, IPI — 5 cols each. */
const RH_START_COL = 21;
const RH_COLS = 5;

function writeSamroRightsHolders(row: ExcelJS.Row, slots: SamroComposerSlot[]) {
  slots.slice(0, SAMRO_MAX_RIGHTS_HOLDERS).forEach((slot, index) => {
    const base = RH_START_COL + index * RH_COLS;
    row.getCell(base).value = "Composer";
    row.getCell(base + 1).value = slot.name;
    row.getCell(base + 2).value = slot.perfShare;
    row.getCell(base + 3).value = slot.proSociety || "SAMRO";
    if (slot.ipi.trim()) row.getCell(base + 4).value = slot.ipi.trim();
  });
}

/**
 * Fill the official SAMRO Notification of Works workbook for a submission.
 * Returns an ArrayBuffer suitable for download.
 */
export async function buildSamroWorkbookBuffer(
  submissionId: string,
  profile: SamroProProfile,
): Promise<{ buffer: ExcelJS.Buffer; fileName: string }> {
  const submission = getSamroSubmission(submissionId);
  if (!submission) throw new Error("Submission not found");
  if (!submission.trackIds.length) throw new Error("Submission has no tracks");

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error("SAMRO template missing — place file in data/templates/");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet(SHEET);
  if (!sheet) throw new Error(`Sheet ${SHEET} not found in template`);

  // Publisher Name sits next to the label in row 3 (column B).
  sheet.getCell(3, 2).value = submission.publisherName;

  const trackRows = getTracksByIds(submission.trackIds);
  const byId = new Map(trackRows.map((t) => [t.id, t]));
  // Preserve submission order
  const ordered = attachSamroComposerSlots(
    submission.trackIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((t) => toTrackListItem(t!)),
    profile,
  );

  let rowIndex = DATA_START_ROW;
  for (const track of ordered) {
    const readiness = assessSamroReadiness(track, profile);
    if (!readiness.ready) {
      throw new Error(`Track ${track.id} is incomplete: ${readiness.missing.join(", ")}`);
    }

    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = track.id;
    row.getCell(2).value = readiness.title;
    row.getCell(3).value = readiness.durationMin ?? 0;
    row.getCell(4).value = readiness.durationSec ?? 0;
    row.getCell(5).value = readiness.firstPublicationDate;
    row.getCell(6).value = readiness.origin;
    row.getCell(7).value = readiness.territory;
    row.getCell(8).value = readiness.genre;
    row.getCell(9).value = readiness.instrumentation;
    // Col 10 Number of instruments — leave blank (optional)
    if (readiness.subtitle) {
      row.getCell(15).value = "Sub-Title";
      row.getCell(16).value = readiness.subtitle;
    }

    writeSamroRightsHolders(row, readiness.composerSlots);

    row.commit();
    rowIndex += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName =
    submission.fileName ||
    `SAMRO-NOW-${submission.publisherName.replace(/\s+/g, "-")}.xlsx`;
  return { buffer, fileName };
}
