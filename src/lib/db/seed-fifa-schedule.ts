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

const venueNameZh: Record<string, string> = {
  "Estadio Azteca": "阿兹特克体育场",
  "BC Place": "BC 展馆",
  "Toronto Stadium": "多伦多体育场",
  "Estadio Guadalajara": "瓜达拉哈拉体育场",
  "Estadio Monterrey": "蒙特雷体育场",
  "Atlanta Stadium": "亚特兰大体育场",
  "Boston Stadium": "波士顿体育场",
  "Dallas Stadium": "达拉斯体育场",
  "Houston Stadium": "休斯顿体育场",
  "Kansas City Stadium": "堪萨斯城体育场",
  "Los Angeles Stadium": "洛杉矶体育场",
  "Miami Stadium": "迈阿密体育场",
  "New York New Jersey Stadium": "纽约新泽西体育场",
  "Philadelphia Stadium": "费城体育场",
  "Bay Area Stadium": "旧金山湾区体育场",
  "Seattle Stadium": "西雅图体育场",
};

const teamNameZh: Record<string, string> = {
  Algeria: "阿尔及利亚", Argentina: "阿根廷",
  Australia: "澳大利亚", Belgium: "比利时", Bolivia: "玻利维亚",
  Brazil: "巴西", Cameroon: "喀麦隆", Canada: "加拿大",
  Chile: "智利", Colombia: "哥伦比亚", "Costa Rica": "哥斯达黎加",
  Croatia: "克罗地亚", Cuba: "古巴", "Czech Republic": "捷克",
  Denmark: "丹麦", Ecuador: "厄瓜多尔", Egypt: "埃及",
  England: "英格兰", France: "法国", Germany: "德国",
  Greece: "希腊", Haiti: "海地", Honduras: "洪都拉斯",
  Hungary: "匈牙利", Iran: "伊朗", Iraq: "伊拉克",
  Italy: "意大利", Jamaica: "牙买加", Japan: "日本",
  Jordan: "约旦", "South Korea": "韩国", Mexico: "墨西哥",
  Morocco: "摩洛哥", Netherlands: "荷兰", "New Zealand": "新西兰",
  Nigeria: "尼日利亚", Panama: "巴拿马", Paraguay: "巴拉圭",
  Peru: "秘鲁", Poland: "波兰", Portugal: "葡萄牙",
  Qatar: "卡塔尔", "Saudi Arabia": "沙特阿拉伯", Senegal: "塞内加尔",
  Serbia: "塞尔维亚", Slovakia: "斯洛伐克", Slovenia: "斯洛文尼亚",
  "South Africa": "南非", Spain: "西班牙", Sweden: "瑞典",
  Switzerland: "瑞士", Tunisia: "突尼斯", Turkey: "土耳其",
  Ukraine: "乌克兰", "United States": "美国", Uruguay: "乌拉圭",
  Uzbekistan: "乌兹别克斯坦",
  // FIFA code based fallbacks from fifa-schedule.json
  ALG: "阿尔及利亚", ARG: "阿根廷", AUS: "澳大利亚", BEL: "比利时",
  BOL: "玻利维亚", BRA: "巴西", CAM: "喀麦隆", CAN: "加拿大",
  CHI: "智利", COL: "哥伦比亚", CRC: "哥斯达黎加", CRO: "克罗地亚",
  CUB: "古巴", CZE: "捷克", DEN: "丹麦", ECU: "厄瓜多尔",
  EGY: "埃及", ENG: "英格兰", FRA: "法国", GER: "德国",
  GRE: "希腊", HAI: "海地", HON: "洪都拉斯", HUN: "匈牙利",
  IRN: "伊朗", IRQ: "伊拉克", ITA: "意大利", JAM: "牙买加",
  JPN: "日本", JOR: "约旦", KOR: "韩国", MEX: "墨西哥",
  MAR: "摩洛哥", NED: "荷兰", NZL: "新西兰", NGA: "尼日利亚",
  PAN: "巴拿马", PAR: "巴拉圭", PER: "秘鲁", POL: "波兰",
  POR: "葡萄牙", QAT: "卡塔尔", KSA: "沙特阿拉伯", SEN: "塞内加尔",
  SRB: "塞尔维亚", SVK: "斯洛伐克", SVN: "斯洛文尼亚",
  RSA: "南非", ESP: "西班牙", SWE: "瑞典", SUI: "瑞士",
  TUN: "突尼斯", TUR: "土耳其", UKR: "乌克兰", USA: "美国",
  URU: "乌拉圭", UZB: "乌兹别克斯坦",
  BIH: "波黑", "Bosnia-Herzegovina": "波黑", "Bosnia & Herzegovina": "波黑",
  "Cape Verde": "佛得角", "Cabo Verde": "佛得角",
  "Congo DR": "刚果民主共和国", "DR Congo": "刚果民主共和国",
  "Côte d'Ivoire": "科特迪瓦", "Ivory Coast": "科特迪瓦",
  Scotland: "苏格兰", SCO: "苏格兰", NOR: "挪威", Norway: "挪威",
  ROM: "罗马尼亚", Romania: "罗马尼亚",
};

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
          nameZh: teamNameZh[team.code] || teamNameZh[team.name] || null,
          raw: team,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: teams.id,
          set: {
            fifaCode: team.code,
            name: team.name,
            nameZh: teamNameZh[team.code] || teamNameZh[team.name] || null,
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
          nameZh: venueNameZh[venue.name] || null,
          countryCode: countryCodeForCity(venue.city),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: venues.id,
          set: {
            name: venue.name,
            nameZh: venueNameZh[venue.name] || null,
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
