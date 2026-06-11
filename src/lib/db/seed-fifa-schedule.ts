import { config } from "dotenv";
import fifaScheduleData from "@/data/fifa-schedule.json";
import type { FifaScheduleRecord } from "@/lib/wc-data";
import { closeDatabase, getDb, isDatabaseConfigured } from "./client";
import { competitions, matches, teams, venues } from "./schema/world-cup";

config({ path: ".env" });

const competitionId = "fifa-world-cup-2026";
const sourceId = "fifa-official-pdf";

function slug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function countryCodeForCity(city: string): string {
  if (["Vancouver", "Toronto"].includes(city)) return "CAN";
  if (["Guadalajara", "Mexico City", "Monterrey"].includes(city)) return "MEX";
  return "USA";
}

export async function seedFifaSchedule() {
  if (!isDatabaseConfigured) {
    throw new Error("DATABASE_URL is required to seed the FIFA schedule.");
  }

  const schedule = fifaScheduleData as {
    source: { extractedAt: string };
    matches: FifaScheduleRecord[];
  };
  const now = new Date();
  const sourceUpdatedAt = new Date(schedule.source.extractedAt);

  await getDb().transaction(async (tx) => {
    await tx
      .insert(competitions)
      .values({
        id: competitionId,
        name: "FIFA World Cup 2026",
        season: 2026,
        sourceId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: competitions.id,
        set: {
          name: "FIFA World Cup 2026",
          season: 2026,
          sourceId,
          updatedAt: now,
        },
      });

    const uniqueTeams = new Map<string, { code: string; name: string }>();
    const uniqueVenues = new Map<
      string,
      { id: string; name: string; city: string; utcOffset: string }
    >();

    for (const match of schedule.matches) {
      if (match.home.code) uniqueTeams.set(match.home.code, { code: match.home.code, name: match.home.name });
      if (match.away.code) uniqueTeams.set(match.away.code, { code: match.away.code, name: match.away.name });
      const venueId = `venue-${slug(match.city)}`;
      uniqueVenues.set(venueId, {
        id: venueId,
        name: match.venue,
        city: match.city,
        utcOffset: match.localUtcOffset,
      });
    }

    for (const team of uniqueTeams.values()) {
      await tx
        .insert(teams)
        .values({
          id: `team-${team.code.toLowerCase()}`,
          fifaCode: team.code,
          name: team.name,
          raw: team,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: teams.id,
          set: {
            fifaCode: team.code,
            name: team.name,
            raw: team,
            updatedAt: now,
          },
        });
    }

    for (const venue of uniqueVenues.values()) {
      await tx
        .insert(venues)
        .values({
          ...venue,
          countryCode: countryCodeForCity(venue.city),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: venues.id,
          set: {
            name: venue.name,
            city: venue.city,
            countryCode: countryCodeForCity(venue.city),
            utcOffset: venue.utcOffset,
            updatedAt: now,
          },
        });
    }

    for (const match of schedule.matches) {
      await tx
        .insert(matches)
        .values({
          id: `fifa-${match.matchNo}`,
          competitionId,
          matchNo: match.matchNo,
          stage: match.stage,
          groupName: match.group,
          easternDate: match.easternDate,
          easternTime: match.easternTime,
          localDate: match.localDate,
          localTime: match.localTime,
          kickoffAt: new Date(match.kickoffBeijing),
          venueId: `venue-${slug(match.city)}`,
          homeTeamId: match.home.code ? `team-${match.home.code.toLowerCase()}` : null,
          awayTeamId: match.away.code ? `team-${match.away.code.toLowerCase()}` : null,
          homePlaceholder: match.home.code ? null : match.home.name,
          awayPlaceholder: match.away.code ? null : match.away.name,
          sourceId,
          sourceUpdatedAt,
          raw: match,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: matches.id,
          set: {
            stage: match.stage,
            groupName: match.group,
            easternDate: match.easternDate,
            easternTime: match.easternTime,
            localDate: match.localDate,
            localTime: match.localTime,
            kickoffAt: new Date(match.kickoffBeijing),
            venueId: `venue-${slug(match.city)}`,
            homeTeamId: match.home.code ? `team-${match.home.code.toLowerCase()}` : null,
            awayTeamId: match.away.code ? `team-${match.away.code.toLowerCase()}` : null,
            homePlaceholder: match.home.code ? null : match.home.name,
            awayPlaceholder: match.away.code ? null : match.away.name,
            sourceId,
            sourceUpdatedAt,
            raw: match,
            updatedAt: now,
          },
        });
    }
  });

  console.log(`Seeded ${schedule.matches.length} FIFA World Cup matches.`);
}

const isDirectRun = process.argv[1]?.endsWith("seed-fifa-schedule.ts")
  || process.argv[1]?.endsWith("seed-fifa-schedule.js");

if (isDirectRun) {
  seedFifaSchedule()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closeDatabase();
    });
}
