import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { closeDatabase, getDb, isDatabaseConfigured } from "./client";
import { players } from "./schema/world-cup";

config({ path: ".env" });

const defaultCsvPath = "docs/worldcup-2026-squads-fifa-merged-cn.csv";
const defaultPhotoCachePath = "data/runtime-cache.json";
const sourceId = "fifa-official-squad-csv";

type CsvRow = Record<string, string>;
type PhotoIndex = Map<string, string>;

interface RuntimeCacheFetch {
  sourceId?: string;
  payload?: unknown;
}

interface RuntimeCache {
  rawFetches?: Record<string, RuntimeCacheFetch>;
}

interface ApiFootballSquadPlayer {
  name?: string;
  number?: number | null;
  photo?: string | null;
}

interface ApiFootballSquad {
  team?: {
    name?: string;
  };
  players?: ApiFootballSquadPlayer[];
}

interface ApiFootballSquadPayload {
  response?: ApiFootballSquad[];
}

const positionZhByCode: Record<string, string> = {
  GK: "门将",
  DF: "后卫",
  MF: "中场",
  FW: "前锋",
};

const playerPhotoNameAliases: Record<string, string[]> = {
  "KSA|alaalhajji": ["Ala Al Haji"],
  "RSA|evidencemakgopa": ["E. Makgopa"],
  "UZB|azizbekamonov": ["A. Amonov"],
  "UZB|jakhongirurozov": ["J. Urozov"],
};

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === "\"" && next === "\"") {
        cell += "\"";
        index += 1;
      } else if (char === "\"") {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === "\"") {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => value.trim()));
}

function readCsvRows(input: string): CsvRow[] {
  const parsed = parseCsv(input);
  const [headerRow, ...dataRows] = parsed;
  if (!headerRow) return [];
  const headers = headerRow.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim(),
  );

  return dataRows.map((row) =>
    Object.fromEntries(headers.map((header, index) => [header, (row[index] || "").trim()])),
  );
}

function slug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function canonical(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function parseIntOrNull(input: string): number | null {
  if (!input) return null;
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) ? value : null;
}

function parseMatchScore(input: string): string | null {
  if (!input) return null;
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value.toFixed(2) : null;
}

function titleCaseName(input: string): string {
  return input
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function displayEnglishName(row: CsvRow): string {
  const name = row["球员英文名"];
  const tokens = name.split(/\s+/).filter(Boolean);
  const firstGivenIndex = tokens.findIndex((token) => /[a-z]/.test(token));
  if (firstGivenIndex > 0) {
    const lastName = titleCaseName(tokens.slice(0, firstGivenIndex).join(" "));
    const givenName = tokens.slice(firstGivenIndex).join(" ");
    return `${givenName} ${lastName}`;
  }
  if (firstGivenIndex === 0) return name;
  return titleCaseName(name);
}

function buildTeamCodeByName(rows: CsvRow[]): Map<string, string> {
  const teamCodeByName = new Map<string, string>();
  for (const row of rows) {
    const teamCode = row["FIFA代码"];
    const teamName = row["队伍英文"];
    if (teamCode && teamName) teamCodeByName.set(canonical(teamName), teamCode);
  }

  const aliases: Record<string, string> = {
    bosniaandherzegovina: "BIH",
    capeverdeislands: "CPV",
    ivorycoast: "CIV",
    czechrepublic: "CZE",
    iran: "IRN",
    southkorea: "KOR",
  };
  for (const [name, code] of Object.entries(aliases)) {
    teamCodeByName.set(name, code);
  }

  return teamCodeByName;
}

function photoKey(teamCode: string, value: string | number): string {
  return `${teamCode}|${String(value)}`;
}

function addPlayerPhoto(photoIndex: PhotoIndex, teamCode: string, player: ApiFootballSquadPlayer) {
  const photo = player.photo || "";
  if (!photo) return;

  if (typeof player.number === "number" && Number.isFinite(player.number)) {
    photoIndex.set(photoKey(teamCode, player.number), photo);
  }
  if (player.name) {
    photoIndex.set(photoKey(teamCode, canonical(player.name)), photo);
  }
}

function isApiFootballSquadPayload(input: unknown): input is ApiFootballSquadPayload {
  if (!input || typeof input !== "object") return false;
  const response = (input as ApiFootballSquadPayload).response;
  return Array.isArray(response);
}

async function loadPhotoIndex(photoCachePath: string, rows: CsvRow[]): Promise<PhotoIndex> {
  const photoIndex: PhotoIndex = new Map();
  const resolvedPath = path.resolve(process.cwd(), photoCachePath);
  let cache: RuntimeCache;

  try {
    cache = JSON.parse(await readFile(resolvedPath, "utf8")) as RuntimeCache;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return photoIndex;
    throw error;
  }

  const teamCodeByName = buildTeamCodeByName(rows);
  for (const fetch of Object.values(cache.rawFetches || {})) {
    if (fetch.sourceId !== "api-football-worldcup-squads" || !isApiFootballSquadPayload(fetch.payload)) {
      continue;
    }

    for (const squad of fetch.payload.response || []) {
      const teamName = squad.team?.name || "";
      const teamCode = teamCodeByName.get(canonical(teamName));
      if (!teamCode) continue;

      for (const player of squad.players || []) {
        addPlayerPhoto(photoIndex, teamCode, player);
      }
    }
  }

  return photoIndex;
}

function photoForRow(row: CsvRow, photoIndex: PhotoIndex): string | null {
  const teamCode = row["FIFA代码"];
  const shirtNumber = parseIntOrNull(row["球衣号码"]);
  if (shirtNumber !== null) {
    const byNumber = photoIndex.get(photoKey(teamCode, shirtNumber));
    if (byNumber) return byNumber;
  }

  const nameCandidates = [
    displayEnglishName(row),
    row["球员英文名"],
    row["球衣名"],
    `${row["英文名"]} ${row["英文姓"]}`,
  ];
  for (const candidate of nameCandidates) {
    const key = canonical(candidate);
    if (!key) continue;
    const byName = photoIndex.get(photoKey(teamCode, key));
    if (byName) return byName;
  }

  const aliasKey = photoKey(teamCode, canonical(displayEnglishName(row)));
  for (const alias of playerPhotoNameAliases[aliasKey] || []) {
    const byAlias = photoIndex.get(photoKey(teamCode, canonical(alias)));
    if (byAlias) return byAlias;
  }

  return null;
}

function dbValue(row: CsvRow, now: Date, photoIndex: PhotoIndex) {
  const teamCode = row["FIFA代码"];
  const shirtNumber = parseIntOrNull(row["球衣号码"]);
  if (!teamCode || !shirtNumber) {
    throw new Error(`Invalid player row without FIFA code or shirt number: ${JSON.stringify(row)}`);
  }
  const positionCode = row["位置代码"];
  const id = `player-${teamCode.toLowerCase()}-${String(shirtNumber).padStart(2, "0")}-${slug(row["球员英文名"])}`;
  const photo = photoForRow(row, photoIndex);

  return {
    id,
    teamId: `team-${teamCode.toLowerCase()}`,
    teamCode,
    teamName: row["队伍英文"],
    teamNameZh: row["队伍中文"] || null,
    groupName: row["小组"] || null,
    shirtNumber,
    positionCode,
    position: row["位置英文"] || positionCode,
    positionZh: row["中文名单位置"] || positionZhByCode[positionCode] || positionCode,
    playerName: displayEnglishName(row),
    firstName: row["英文名"] || null,
    lastName: row["英文姓"] || null,
    shirtName: row["球衣名"] || null,
    nameZh: row["球员中文名"] || null,
    dateOfBirth: row["出生日期"] ? row["出生日期"].split("/").reverse().join("-") : null,
    club: row["所属俱乐部英文"] || null,
    clubZh: row["所属俱乐部中文"] || null,
    photoUrl: photo,
    avatarUrl: photo,
    heightCm: parseIntOrNull(row["身高cm"]),
    caps: parseIntOrNull(row["国家队出场"]),
    goals: parseIntOrNull(row["国家队进球"]),
    sourceId,
    sourcePage: parseIntOrNull(row["页码"]),
    matchStatus: row["匹配方式"] || "unmatched",
    matchScore: parseMatchScore(row["匹配分数"]),
    raw: row,
    updatedAt: now,
  };
}

export async function importFifaPlayersFromCsv(csvPath = defaultCsvPath, photoCachePath = defaultPhotoCachePath) {
  if (!isDatabaseConfigured) {
    throw new Error("DATABASE_URL is required to import FIFA players.");
  }

  const resolvedPath = path.resolve(process.cwd(), csvPath);
  const csv = await readFile(resolvedPath, "utf8");
  const rows = readCsvRows(csv);
  if (rows.length !== 1248) {
    throw new Error(`Expected 1248 FIFA player rows, found ${rows.length}.`);
  }

  const now = new Date();
  const photoIndex = await loadPhotoIndex(photoCachePath, rows);
  const values = rows.map((row) => dbValue(row, now, photoIndex));

  await getDb().transaction(async (tx) => {
    await tx.delete(players).where(eq(players.sourceId, sourceId));
    for (const value of values) {
      await tx.insert(players).values(value);
    }
  });

  const matched = values.filter((row) => row.nameZh && row.clubZh).length;
  const withPhotos = values.filter((row) => row.photoUrl).length;
  console.log(`Imported ${values.length} FIFA player rows from ${resolvedPath}.`);
  console.log(`Rows with Chinese player + club fields: ${matched}.`);
  console.log(`Rows with player photos: ${withPhotos}.`);
  console.log(`Rows without a reliable Chinese match: ${values.length - matched}.`);
}

const isDirectRun = process.argv[1]?.endsWith("import-fifa-players.ts")
  || process.argv[1]?.endsWith("import-fifa-players.js");

if (isDirectRun) {
  importFifaPlayersFromCsv(process.argv[2] || defaultCsvPath, process.argv[3] || defaultPhotoCachePath)
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase();
    });
}
