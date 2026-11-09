import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getCapassoSubmission } from "@/lib/capasso-submissions";
import { attachSamroComposerSlots } from "@/lib/composers";
import { getTracksByIds } from "@/lib/queries";
import {
  assessCapassoReadiness,
  capassoWriterRowFields,
  type CapassoProProfile,
} from "@/lib/capasso";
import { getSamroProProfileFromSiteSettings } from "@/lib/publisher";
import { toTrackListItem } from "@/lib/track-list-item";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "data/templates/PRODUCTION-MUSIC-TEMPLATE.xlsx",
);
const DATA_START_ROW = 2;

/**
 * Fill the Capasso production-music workbook — one row per track.
 * COPYRIGHT_SHARE is the house publisher split (100% / number of publishers).
 */
export async function buildCapassoWorkbookBuffer(
  submissionId: string,
  profile: CapassoProProfile,
): Promise<{ buffer: ExcelJS.Buffer; fileName: string }> {
  const submission = getCapassoSubmission(submissionId);
  if (!submission) throw new Error("Submission not found");
  if (!submission.trackIds.length) throw new Error("Submission has no tracks");

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error("Capasso production-music template missing — place file in data/templates/");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet("SHEET") || workbook.worksheets[0];
  if (!sheet) throw new Error("No worksheet found in Capasso production-music template");

  const trackRows = getTracksByIds(submission.trackIds);
  const byId = new Map(trackRows.map((t) => [t.id, t]));
  const ordered = attachSamroComposerSlots(
    submission.trackIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((t) => toTrackListItem(t!)),
    getSamroProProfileFromSiteSettings(),
  );

  let rowIndex = DATA_START_ROW;
  for (const track of ordered) {
    const readiness = assessCapassoReadiness(track, profile);
    if (!readiness.ready) {
      throw new Error(`Track ${track.id} is incomplete: ${readiness.missing.join(", ")}`);
    }

    const writer = capassoWriterRowFields(readiness, profile);
    const duration = (track.duration || "").trim();
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = track.id;
    row.getCell(4).value = readiness.title;
    if (duration) row.getCell(5).value = duration;
    if (writer.ipi) row.getCell(6).value = writer.ipi;
    if (writer.lastName) row.getCell(7).value = writer.lastName;
    if (writer.firstName) row.getCell(8).value = writer.firstName;
    row.getCell(9).value = readiness.publisherShare;
    if (profile.houseName) {
      row.getCell(10).value = profile.houseName;
      row.getCell(11).value = profile.houseName;
    }
    row.getCell(12).value = profile.caaNumber;
    row.getCell(13).value = profile.houseName;
    row.commit();
    rowIndex += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName =
    submission.fileName ||
    `CAPASSO-SWI-${submission.publisherName.replace(/\s+/g, "-")}.xlsx`;
  return { buffer, fileName };
}
