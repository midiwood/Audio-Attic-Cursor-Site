export type TrackListItem = {
  id: string;
  date: string | null;
  createdAt: string | null;
  libraryTitle: string | null;
  workingTitle: string | null;
  client: string | null;
  project: string | null;
  description: string | null;
  notes: string | null;
  year: number | null;
  duration: string | null;
  bpm: number | null;
  musicalKey: string | null;
  artist: string | null;
  publisher: string | null;
  genre: string | null;
  mood: string | null;
  instruments: string | null;
  attributes: string | null;
  samro: string | null;
  license: string | null;
  licenseDetail: string | null;
  perpetuity: string | null;
  licenseExpires: string | null;
  dropboxLink: string | null;
  dropboxDl: string | null;
  /** Server-resolved SAMRO rights holders (IPI + custom perf shares). */
  composerSlots?: Array<{
    name: string;
    ipi: string;
    proSociety: string;
    perfShare: number;
  }>;
};

export function toTrackListItem(track: {
  id: string;
  date?: string | null;
  createdAt?: string | null;
  libraryTitle: string | null;
  workingTitle: string | null;
  client: string | null;
  project?: string | null;
  description: string | null;
  notes?: string | null;
  year: number | null;
  duration: string | null;
  bpm: number | null;
  musicalKey?: string | null;
  artist?: string | null;
  publisher?: string | null;
  genre: string | null;
  mood: string | null;
  instruments?: string | null;
  attributes?: string | null;
  samro?: string | null;
  license: string | null;
  licenseDetail?: string | null;
  perpetuity?: string | null;
  licenseExpires?: string | null;
  dropboxLink?: string | null;
  dropboxDl: string | null;
}): TrackListItem {
  return {
    id: track.id,
    date: track.date ?? null,
    createdAt: track.createdAt ?? null,
    libraryTitle: track.libraryTitle,
    workingTitle: track.workingTitle,
    client: track.client,
    project: track.project ?? null,
    description: track.description,
    notes: track.notes ?? null,
    year: track.year,
    duration: track.duration,
    bpm: track.bpm,
    musicalKey: track.musicalKey ?? null,
    artist: track.artist ?? null,
    publisher: track.publisher ?? null,
    genre: track.genre,
    mood: track.mood,
    instruments: track.instruments ?? null,
    attributes: track.attributes ?? null,
    samro: track.samro ?? null,
    license: track.license,
    licenseDetail: track.licenseDetail ?? null,
    perpetuity: track.perpetuity ?? null,
    licenseExpires: track.licenseExpires ?? null,
    dropboxLink: track.dropboxLink ?? null,
    dropboxDl: track.dropboxDl,
  };
}
