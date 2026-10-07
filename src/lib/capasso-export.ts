import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import { getCapassoSubmission } from "@/lib/capasso-submissions";
import { attachSamroComposerSlots } from "@/lib/composers";
import { getTracksByIds } from "@/lib/queries";
import {
  assessCapassoReadiness,
  capassoWriterRowFields,
  CAPASSO_MR_SOC,
  CAPASSO_PR_SOC,
  CAPASSO_TERRITORY,
  CAPASSO_WRITER_ROLE,
  type CapassoProProfile,
} from "@/lib/capasso";
import { getSamroProProfileFromSiteSettings } from "@/lib/publisher";
import { toTrackListItem } from "@/lib/track-list-item";

const TEMPLATE_PATH = path.join(process.cwd(), "data/templates/SWI-TEMPLATE-Ver-2.0.xlsx");
const SHEET = "SWI";
const DATA_START_ROW = 2;

/**
 * Fill the official Capasso SWI workbook — one row per track.
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
    throw new Error("Capasso SWI template missing — place file in data/templates/");
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);
  const sheet = workbook.getWorksheet(SHEET);
  if (!sheet) throw new Error(`Sheet ${SHEET} not found in template`);

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
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = track.id;
    row.getCell(4).value = readiness.title;
    if (readiness.subtitle) row.getCell(5).value = readiness.subtitle;
    if (readiness.artist) row.getCell(6).value = readiness.artist;
    if (writer.lastName) row.getCell(8).value = writer.lastName;
    if (writer.firstName) row.getCell(9).value = writer.firstName;
    if (writer.ipi) row.getCell(11).value = writer.ipi;
    row.getCell(12).value = CAPASSO_PR_SOC;
    row.getCell(13).value = CAPASSO_MR_SOC;
    row.getCell(14).value = CAPASSO_WRITER_ROLE;
    row.getCell(15).value = readiness.publisherShare;
    row.getCell(16).value = profile.caaNumber;
    row.getCell(17).value = profile.houseName;
    if (profile.ipiNumber) row.getCell(18).value = profile.ipiNumber;
    row.getCell(19).value = CAPASSO_PR_SOC;
    row.getCell(20).value = CAPASSO_MR_SOC;
    row.getCell(21).value = CAPASSO_TERRITORY;
    row.commit();
    rowIndex += 1;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName =
    submission.fileName ||
    `CAPASSO-SWI-${submission.publisherName.replace(/\s+/g, "-")}.xlsx`;
  return { buffer, fileName };
}
