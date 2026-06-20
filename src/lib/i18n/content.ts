import type { LocaleCode } from "@/lib/i18n/locale";
import type { Match, NewsArticle, Team } from "@/lib/wc-data";

export function isZh(locale: LocaleCode | string): boolean {
  return String(locale).startsWith("zh");
}

const teamNameEnByZh: Record<string, string> = {
  墨西哥: "Mexico",
  南非: "South Africa",
  韩国: "South Korea",
  捷克: "Czechia",
  加拿大: "Canada",
  波黑: "Bosnia and Herzegovina",
  美国: "United States",
  巴拉圭: "Paraguay",
  海地: "Haiti",
  苏格兰: "Scotland",
  澳大利亚: "Australia",
  土耳其: "Türkiye",
  巴西: "Brazil",
  摩洛哥: "Morocco",
  卡塔尔: "Qatar",
  瑞士: "Switzerland",
  科特迪瓦: "Côte d'Ivoire",
  厄瓜多尔: "Ecuador",
  德国: "Germany",
  库拉索: "Curaçao",
  荷兰: "Netherlands",
  日本: "Japan",
  瑞典: "Sweden",
  突尼斯: "Tunisia",
  沙特阿拉伯: "Saudi Arabia",
  乌拉圭: "Uruguay",
  西班牙: "Spain",
  佛得角: "Cabo Verde",
  伊朗: "IR Iran",
  新西兰: "New Zealand",
  比利时: "Belgium",
  埃及: "Egypt",
  法国: "France",
  塞内加尔: "Senegal",
  伊拉克: "Iraq",
  挪威: "Norway",
  阿根廷: "Argentina",
  阿尔及利亚: "Algeria",
  奥地利: "Austria",
  约旦: "Jordan",
  加纳: "Ghana",
  巴拿马: "Panama",
  英格兰: "England",
  克罗地亚: "Croatia",
  葡萄牙: "Portugal",
  刚果民主共和国: "DR Congo",
  乌兹别克斯坦: "Uzbekistan",
  哥伦比亚: "Colombia",
};

const phraseEnByZh: Record<string, string> = {
  赛程: "Schedule",
  积分榜: "Standings",
  早报: "Brief",
  球队: "Teams",
  天眼: "Odds",
  盘口: "Odds",
  工具: "Tools",
  明天: "Tomorrow",
  后天: "In 2 days",
  今天: "Today",
  昨天: "Yesterday",
  出线区: "Qualification Zone",
  待定区: "Bubble Zone",
  观察区: "Watch Zone",
  主帅: "Coach",
  主力球星: "Key players",
  完整名单: "Full squad",
};

export function tr(locale: LocaleCode | string, zh: string, en: string): string {
  return isZh(locale) ? zh : en;
}

export function teamName(name: string, locale: LocaleCode | string): string {
  if (isZh(locale)) return name;
  return teamNameEnByZh[name] || name;
}

const teamNameZhByEn: Record<string, string> = Object.fromEntries(
  Object.entries(teamNameEnByZh).map(([zh, en]) => [en, zh]),
);

export function localizeTeamName(name: string, locale: LocaleCode | string): string {
  if (isZh(locale)) return teamNameZhByEn[name] || name;
  return teamNameEnByZh[name] || name;
}

export function teamLabel(flag: string, name: string, locale: LocaleCode | string): string {
  return `${flag}${teamName(name, locale)}`;
}

export function groupLabel(group: string, locale: LocaleCode | string): string {
  if (isZh(locale)) return group;
  const letter = group.match(/[A-Z]/)?.[0];
  if (!letter) return group.replace("淘汰赛", "Knockout Stage");
  return `Group ${letter}`;
}

export function roundLabel(text: string, locale: LocaleCode | string): string {
  if (isZh(locale)) return text;
  return text
    .replace("小组赛", "Group Stage")
    .replace("三十二强", "Round of 32")
    .replace("十六强", "Round of 16")
    .replace("四分之一决赛", "Quarter-final")
    .replace("半决赛", "Semi-final")
    .replace("三四名决赛", "Third-place Match")
    .replace("决赛", "Final");
}

export function simpleText(text: string, locale: LocaleCode | string): string {
  if (isZh(locale)) return text;
  return phraseEnByZh[text] || text;
}

export function dateLabel(date: string, locale: LocaleCode | string): string {
  if (isZh(locale)) {
    const [, month, day] = date.split("-");
    return `${Number(month)}月${Number(day)}日`;
  }
  const parsed = new Date(`${date}T00:00:00+08:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(parsed);
}

export function localizeMatch(match: Match, locale: LocaleCode | string): Match {
  if (isZh(locale)) return match;
  return {
    ...match,
    homeTeam: teamName(match.homeTeam, locale),
    awayTeam: teamName(match.awayTeam, locale),
    group: groupLabel(match.group, locale),
    round: roundLabel(match.round, locale),
  };
}

export function localizeTeam(team: Team, locale: LocaleCode | string): Team {
  if (isZh(locale)) return team;
  return {
    ...team,
    name: teamName(team.name, locale),
    group: groupLabel(team.group, locale),
  };
}

function articleText(article: NewsArticle): string {
  return `${article.title} ${article.summary} ${article.sourceText || ""}`;
}

function fallbackArticleTitleZh(article: NewsArticle): string | undefined {
  const text = articleText(article);
  if (/world cup of more|never been a tournament like this one/i.test(text)) {
    return "更大规模的世界杯：从未有过这样的赛事";
  }
  if (/u\.s\. excited|usmnt expectations|seton hall poll/i.test(text)) {
    return "2026世界杯民调：美国球迷期待升温，USMNT预期仍克制";
  }
  if (/stadium upgrades.*toronto|toronto.*braces for world cup/i.test(text)) {
    return "多伦多世界杯场馆升级获得正面评价";
  }
  if (/messi.*cristiano ronaldo|cristiano ronaldo.*messi|biggest stage/i.test(text)) {
    return "2026世界杯：梅西和C罗能否终于在最大舞台相遇";
  }
  if (/andrea bocelli|tournament anthem|italy.*representative/i.test(text)) {
    return "安德烈·波切利将代表意大利亮相2026世界杯";
  }
  if (/six fifa world cup-defining|african teams|group-stage fixtures/i.test(text)) {
    return "决定非洲球队命运的六场世界杯小组赛";
  }
  if (/mctominay|misses training/i.test(text) && /scotland/i.test(text)) {
    return "麦克托米奈缺席苏格兰世界杯揭幕战前训练";
  }
  if (/scotland.*world cup openers|history tells us about scotland/i.test(text)) {
    return "苏格兰世界杯揭幕战历史回顾";
  }
  if (/world cup daily live|mexico vs\.? south africa pregame|bafana bafana.*mexico/i.test(text)) {
    return "世界杯日报：墨西哥对南非揭幕战赛前动态";
  }
  if (/england at the 2026 world cup|england.*schedule.*how to watch/i.test(text)) {
    return "2026世界杯英格兰队观赛指南、赛程与赛果入口";
  }
  if (/group a at the 2026 world cup|group a.*teams.*records.*stats/i.test(text)) {
    return "2026世界杯A组巡礼：球队、战绩与关键数据";
  }
  if (/stadium|venue|host cit/i.test(text) && /england|scotland/i.test(text)) {
    return "2026世界杯英格兰与苏格兰比赛场馆指南";
  }
  if (/how to watch|socceroos|fixtures?|results?/i.test(text)) {
    return "2026世界杯澳大利亚队观赛指南、赛程与赛果入口";
  }
  if (/scotland/i.test(text) && /route|knockout|france|england tie/i.test(text)) {
    return "苏格兰2026世界杯淘汰赛路径与潜在对手";
  }
  if (/scotland/i.test(text) && /squad|26 players|steve clarke/i.test(text)) {
    return "苏格兰2026世界杯26人名单与选人解析";
  }
  if (/world cup daily|opener|opening|mexico vs\.? sa|mexico.*south africa/i.test(text)) {
    return "世界杯日报：最大规模赛事将以墨西哥对南非揭幕";
  }
  if (/weather/i.test(text) && /opening|games?/i.test(text)) {
    return "世界杯揭幕阶段天气影响前瞻";
  }
  if (/yellow card|red card|rules?/i.test(text)) {
    return "2026世界杯黄牌、红牌与判罚新规详解";
  }
  if (/referee|official|var/i.test(text)) {
    return "世界杯裁判安排与赛事执法动态";
  }
  if (/world cup|fifa/i.test(text)) {
    if (/schedule|fixture|results?|how to watch|where to watch/i.test(text)) {
      return "2026世界杯赛程、赛果与观赛信息更新";
    }
    if (/stadium|venue|host cit|city|toronto|miami|los angeles|new york|dallas/i.test(text)) {
      return "2026世界杯场馆与主办城市动态";
    }
    if (/squad|roster|lineup|selection|players?|coach|manager|training|injur/i.test(text)) {
      return "2026世界杯球队阵容与备战动态";
    }
    if (/poll|fans?|expectations?|interest/i.test(text)) {
      return "2026世界杯球迷关注度与舆论动态";
    }
    if (/messi|ronaldo|bocelli|star|anthem|celebr/i.test(text)) {
      return "2026世界杯球星与开幕活动动态";
    }
    return "2026世界杯最新动态";
  }
  return undefined;
}

function fallbackArticleSummaryZh(article: NewsArticle): string | undefined {
  const text = articleText(article);
  if (/world cup of more|never been a tournament like this one/i.test(text)) {
    return "报道概述2026世界杯扩军后规模、声量和赛事体验的变化。";
  }
  if (/u\.s\. excited|usmnt expectations|seton hall poll/i.test(text)) {
    return "民调显示美国球迷对世界杯兴趣升温，但对美国男足成绩仍保持相对克制的期待。";
  }
  if (/stadium upgrades.*toronto|toronto.*braces for world cup/i.test(text)) {
    return "报道关注多伦多为世界杯进行的场馆升级，以及城市迎接赛事的准备情况。";
  }
  if (/messi.*cristiano ronaldo|cristiano ronaldo.*messi|biggest stage/i.test(text)) {
    return "报道讨论梅西和C罗在第六次世界杯征程中是否可能终于迎来正面对话。";
  }
  if (/andrea bocelli|tournament anthem|italy.*representative/i.test(text)) {
    return "报道介绍安德烈·波切利将在墨西哥对南非揭幕战前演唱赛事主题曲。";
  }
  if (/six fifa world cup-defining|african teams|group-stage fixtures/i.test(text)) {
    return "报道梳理可能决定非洲球队出线走势的关键世界杯小组赛。";
  }
  if (/mctominay|misses training/i.test(text) && /scotland/i.test(text)) {
    return "报道关注麦克托米奈缺席训练对苏格兰揭幕战备战的影响。";
  }
  if (/scotland.*world cup openers|history tells us about scotland/i.test(text)) {
    return "报道回顾苏格兰历次世界杯揭幕战表现，并对本届开局提供参照。";
  }
  if (/world cup daily live|mexico vs\.? south africa pregame|bafana bafana.*mexico/i.test(text)) {
    return "报道滚动更新揭幕日动态，重点关注南非队与墨西哥队的开幕战。";
  }
  if (/england at the 2026 world cup|england.*schedule.*how to watch/i.test(text)) {
    return "报道整理英格兰队在2026世界杯的赛程、赛果入口、观赛方式和球队动态。";
  }
  if (/group a at the 2026 world cup|group a.*teams.*records.*stats/i.test(text)) {
    return "报道梳理2026世界杯A组参赛球队、历史战绩和需要关注的关键数据。";
  }
  if (/stadium|venue|host cit/i.test(text) && /england|scotland/i.test(text)) {
    return "报道梳理英格兰和苏格兰在2026世界杯期间涉及的美国比赛场馆与城市安排。";
  }
  if (/how to watch|socceroos|fixtures?|results?/i.test(text)) {
    return "报道整理澳大利亚队相关的观赛方式、赛程、结果入口和赛事信息。";
  }
  if (/scotland/i.test(text) && /route|knockout|france|england tie/i.test(text)) {
    return "报道聚焦苏格兰在2026世界杯的出线路径、淘汰赛潜在对手以及可能的英格兰对决。";
  }
  if (/scotland/i.test(text) && /squad|26 players|steve clarke/i.test(text)) {
    return "报道解析史蒂夫·克拉克选出的苏格兰26人名单及其阵容取舍。";
  }
  if (/world cup daily|opener|opening|mexico vs\.? sa|mexico.*south africa/i.test(text)) {
    return "报道关注2026世界杯揭幕战墨西哥对南非，以及本届扩军赛事的开局看点。";
  }
  if (/weather/i.test(text) && /opening|games?/i.test(text)) {
    return "报道分析揭幕阶段天气对比赛准备、现场体验和赛事节奏的潜在影响。";
  }
  if (/yellow card|red card|rules?/i.test(text)) {
    return "报道解读2026世界杯黄牌清零、红牌判罚等竞赛规则变化。";
  }
  if (/referee|official|var/i.test(text)) {
    return "报道关注世界杯裁判安排、执法尺度和相关争议。";
  }
  if (/world cup|fifa/i.test(text)) {
    if (/schedule|fixture|results?|how to watch|where to watch/i.test(text)) {
      return "报道整理世界杯相关赛程、赛果入口、观赛方式和赛事信息。";
    }
    if (/stadium|venue|host cit|city|toronto|miami|los angeles|new york|dallas/i.test(text)) {
      return "报道关注世界杯比赛场馆、主办城市和赛事基础设施准备情况。";
    }
    if (/squad|roster|lineup|selection|players?|coach|manager|training|injur/i.test(text)) {
      return "报道跟进世界杯参赛球队的阵容选择、训练备战和人员状态。";
    }
    if (/poll|fans?|expectations?|interest/i.test(text)) {
      return "报道反映球迷对世界杯的关注度、期待值和相关舆论变化。";
    }
    if (/messi|ronaldo|bocelli|star|anthem|celebr/i.test(text)) {
      return "报道聚焦世界杯球星话题、开幕活动和赛事文化看点。";
    }
    return "报道更新2026世界杯相关动态，具体信息以原文来源为准。";
  }
  return undefined;
}

export function articleTranslationState(
  article: NewsArticle,
  locale: LocaleCode | string,
): "translated" | "rule" | "original" {
  if (!isZh(locale)) return "original";
  if (article.titleZh || article.summaryZh || article.bodyZh?.length || article.keyPointsZh?.length || article.commentZh) {
    return "translated";
  }
  if (fallbackArticleTitleZh(article) || fallbackArticleSummaryZh(article)) return "rule";
  return "original";
}

function looksEnglishText(text: string | undefined): boolean {
  const value = String(text || "");
  const latin = value.match(/[A-Za-z]/g)?.length || 0;
  const han = value.match(/[\u4e00-\u9fff]/g)?.length || 0;
  return latin > han * 2 && latin >= 8;
}

function fallbackArticleCommentZh(article: NewsArticle): string {
  const text = articleText(article);
  if (/stadium|venue|host cit/i.test(text) && /england|scotland/i.test(text)) {
    return "场馆信息看似后勤，实际会影响球队动线、球迷流向和比赛节奏，别只盯着名字好不好听。";
  }
  if (/how to watch|socceroos|fixtures?|results?/i.test(text)) {
    return "观赛入口和赛程整理不是小事，信息越清楚，球迷少走的弯路就越多。";
  }
  if (/scotland/i.test(text) && /route|knockout|france|england tie/i.test(text)) {
    return "淘汰赛路径现在看起来像纸面推演，但强队和宿敌都摆在路上，苏格兰没有太多浪费机会的空间。";
  }
  if (/scotland/i.test(text) && /squad|26 players|steve clarke/i.test(text)) {
    return "26人名单不是点名册，是主帅风险偏好的公开答卷，克拉克这次得为每个取舍负责。";
  }
  if (/world cup daily|opener|opening|mexico vs\.? sa|mexico.*south africa/i.test(text)) {
    return "最大规模世界杯终于要开场，揭幕战先把叙事拉满，真正的含金量还得看比赛内容。";
  }
  if (/weather/i.test(text) && /opening|games?/i.test(text)) {
    return "天气这种变量平时像背景板，到了揭幕阶段就可能直接变成战术题。";
  }
  if (/yellow card|red card|rules?/i.test(text)) {
    return "规则变化写在纸上时很安静，落到关键比赛里就会变成所有人争吵的中心。";
  }
  if (/referee|official|var/i.test(text)) {
    return "裁判新闻通常没人爱看，直到一次判罚把比赛剧本改写，大家才想起来规则也会进攻。";
  }
  const summary = articleSummary(article, "zh-CN") || articleTitle(article, "zh-CN");
  return `一句话：${summary} 别被标题牵着跑，先看事实密度够不够。`;
}

export function articleTitle(article: NewsArticle, locale: LocaleCode | string): string {
  if (isZh(locale)) return article.titleZh || fallbackArticleTitleZh(article) || article.title;
  return article.titleEn || article.title;
}

export function articleSummary(article: NewsArticle, locale: LocaleCode | string): string {
  if (isZh(locale)) return article.summaryZh || fallbackArticleSummaryZh(article) || article.aiSummary || article.summary;
  return article.summaryEn || article.summary;
}

export function articleBody(article: NewsArticle, locale: LocaleCode | string): string[] {
  const preferred = isZh(locale)
    ? article.bodyZh || article.body || article.bodyEn
    : article.bodyEn || article.body || article.bodyZh;
  if (preferred?.length) return preferred.filter(Boolean);

  const summary = articleSummary(article, locale);
  const points = articleKeyPoints(article, locale);
  const sourceText = article.sourceText || article.summary;
  const fallback = [summary, ...points, sourceText].filter(Boolean);
  return [...new Set(fallback)];
}

export function articleKeyPoints(article: NewsArticle, locale: LocaleCode | string): string[] {
  if (isZh(locale)) return article.keyPointsZh || article.aiKeyPoints || [];
  return article.keyPointsEn || [];
}

export function articleComment(article: NewsArticle, locale: LocaleCode | string): string {
  if (isZh(locale)) {
    if (article.commentZh) return article.commentZh;
    if (article.aiComment && !looksEnglishText(article.aiComment)) return article.aiComment;
    return fallbackArticleCommentZh(article);
  }
  return article.commentEn || `One-liner: ${articleSummary(article, locale) || articleTitle(article, locale)}. Read the facts first; the drama can wait.`;
}
