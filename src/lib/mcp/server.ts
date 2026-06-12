import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getAggregatedMatches,
  getAggregatedRadar,
  getAggregatedTeams,
} from "@/lib/data-sources/aggregate";
import {
  getCountdownToBj,
  type Match,
  type RadarMatch,
  type Team,
} from "@/lib/wc-data";

function matchLine(m: Match) {
  return `${m.kickoffBj} ${m.homeFlag}${m.homeTeam} VS ${m.awayFlag}${m.awayTeam} | 市场胜率 ${m.homeWinProb}%-${m.awayWinProb}% | 赔率隐含 ${m.oddsImpliedHome}%-${m.oddsImpliedAway}% | 信号：${m.signalText || "暂无"}`;
}

function resultLine(m: Match) {
  return `${m.homeFlag}${m.homeTeam} ${m.homeScore ?? "-"}:${m.awayScore ?? "-"} ${m.awayFlag}${m.awayTeam} | 进球：${
    m.events?.map((e) => `${e.minute}'${e.player}`).join(", ") || "暂无"
  }`;
}

function radarLine(r: RadarMatch) {
  return `${r.homeFlag}${r.homeTeam} VS ${r.awayFlag}${r.awayTeam} | 市场${r.homeMarketProb}% vs 赔率${r.homeOddsProb}% | 差值${r.diff}% | ${r.diffLabel === "significant" ? "明显分歧" : r.diffLabel === "notable" ? "值得关注" : "基本一致"} | ${r.diffText}`;
}

function teamMatches(t: Team, teamName: string) {
  const input = teamName.toLowerCase();
  return t.name.includes(teamName)
    || t.nameEn.toLowerCase().includes(input)
    || t.tags.some((tag) => tag.includes(teamName));
}

export function buildMcpServer(): McpServer {
  const server = new McpServer({
    name: "worldcup-guide-mcp",
    version: "1.0.0",
  });

  // Tool 1: Get today's matches with probability signals
  server.tool(
    "get_today_matches",
    "获取今日世界杯赛程，包含比分、概率信号和市场风向。",
    {},
    async () => {
      const result = await getAggregatedMatches("today", { cacheMode: "cache-only" });
      const lines = result.matches.map(matchLine);
      return {
        content: [
          {
            type: "text" as const,
            text: `今日 ${result.matches.length} 场比赛（北京时间）：\n${lines.join("\n") || "暂无缓存赛程"}\n\n倒计时：${getCountdownToBj()} 距首场开赛`,
          },
        ],
      };
    }
  );

  // Tool 2: Get yesterday's match results
  server.tool(
    "get_yesterday_results",
    "获取昨日世界杯赛果，包含比分、进球时间线和名场面标签。",
    {},
    async () => {
      const result = await getAggregatedMatches("yesterday", { cacheMode: "cache-only" });
      const lines = result.matches.map(resultLine);
      return {
        content: [{ type: "text" as const, text: lines.join("\n") || "暂无缓存赛果" }],
      };
    }
  );

  // Tool 3: Get team quick card
  server.tool(
    "get_team_card",
    "获取指定球队的速成卡，包含主帅、阵型、核心球员、战术风格和饭局聊天点。",
    { team_name: z.string().describe("球队中文名或英文名，如'法国'、'Argentina'") },
    async ({ team_name }) => {
      const result = await getAggregatedTeams({ cacheMode: "cache-only" });
      const t = result.teams.find((team) => teamMatches(team, team_name));
      if (!t) {
        return {
          content: [
            {
              type: "text" as const,
              text: `未找到球队"${team_name}"，请先等待球队内容后台刷新。当前缓存球队：${result.teams.map((team) => team.name).join("、") || "暂无"}`,
            },
          ],
        };
      }
      const text = [
        `${t.flag} ${t.name}（${t.nameEn}）`,
        `FIFA 排名：#${t.rank} | 小组：${t.group} | 阵型：${t.formation}`,
        `主帅：${t.coach}`,
        `核心球员：${t.stars.join("、")}`,
        `战术风格：${t.style}`,
        `热度：${"★".repeat(t.hotLevel)}`,
        `聊天标签：${t.tags.map((t) => `#${t}`).join(" ")}`,
        `饭局必备 3 点：\n${t.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}`,
      ].join("\n");
      return { content: [{ type: "text" as const, text }] };
    }
  );

  // Tool 4: Get radar analysis (market vs odds)
  server.tool(
    "get_radar_analysis",
    "获取天眼雷达信息差分析，对比 Polymarket 市场概率和赔率隐含概率的差值。",
    {},
    async () => {
      const result = await getAggregatedRadar({ cacheMode: "cache-only" });
      const lines = result.radarMatches.map(radarLine);
      return {
        content: [
          {
            type: "text" as const,
            text: `天眼雷达（${result.radarMatches.length} 场）：\n${lines.join("\n") || "暂无缓存市场信号"}\n\n免责：仅供参考，非投注建议。`,
          },
        ],
      };
    }
  );

  // Tool 5: Get gossip and Polymarket hot topics
  server.tool(
    "get_gossip_hot_topics",
    "获取吃瓜前线热门话题，包含 Polymarket 预测市场概率和一句话解读。",
    {},
    async () => {
      const result = await getAggregatedRadar({ cacheMode: "cache-only" });
      const lines = result.radarMatches.slice(0, 12).map((item) =>
        `${item.title || item.eventTitle || `${item.homeTeam} vs ${item.awayTeam}`} | 市场概率：${item.homeMarketProb}% | 热度：${item.volume || item.volumeUsd || "暂无"} | ${item.diffText}`,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `吃瓜前线（${lines.length} 条话题）：\n${lines.join("\n\n") || "暂无缓存话题"}\n\n所有数据标注为预测市场概率，非确定性判断。`,
          },
        ],
      };
    }
  );

  return server;
}
