import { randomUUID } from "node:crypto";
import type { NewsArticle } from "@/lib/wc-data";

export interface FreeArticleTranslation {
  titleZh: string;
  summaryZh: string;
  keyPointsZh: string[];
  bodyZh: string[];
  providerName: string;
}

type GoogleTranslateResponse = Array<Array<[string, string]>>;
type EdgeTranslateResponse = Array<{
  translations?: Array<{
    text?: string;
  }>;
}>;
type MyMemoryResponse = {
  responseData?: {
    translatedText?: string;
  };
  responseStatus?: number;
};
type LibreTranslateResponse = {
  translatedText?: string;
};

const defaultGoogleEndpoint = "https://translate.googleapis.com/translate_a/single";
const edgeAuthEndpoint = "https://edge.microsoft.com/translate/auth";
const edgeTranslateEndpoint = "https://api-edge.cognitive.microsofttranslator.com/translate";
const myMemoryEndpoint = "https://api.mymemory.translated.net/get";
const libreTranslateEndpoints = [
  "https://libretranslate.com/translate",
  "https://translate.argosopentech.com/translate",
];

type TranslateResult = {
  text: string;
  providerName: string;
};

type TranslateProvider = {
  name: string;
  translate: (text: string) => Promise<string>;
};

let edgeAuthToken = "";

function normalizeText(input: string | undefined): string {
  return String(input || "").replace(/\s+/g, " ").trim();
}

function articleBody(article: NewsArticle): string[] {
  return (article.body?.length ? article.body : article.sourceText ? [article.sourceText] : [article.summary])
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, 8);
}

function customTranslateEndpoints(): string[] {
  return [
    ...(process.env.FREE_TRANSLATE_ENDPOINTS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    process.env.FREE_TRANSLATE_ENDPOINT || "",
  ].filter(Boolean);
}

async function translateWithGoogle(text: string, endpoint = defaultGoogleEndpoint): Promise<string> {
  const url = new URL(endpoint);
  url.searchParams.set("client", "gtx");
  url.searchParams.set("sl", "en");
  url.searchParams.set("tl", "zh-CN");
  url.searchParams.set("dt", "t");
  url.searchParams.set("q", text.slice(0, 1800));

  const response = await fetch(url, {
    headers: { accept: "application/json, text/javascript, */*" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`free translate HTTP ${response.status}`);

  const data = (await response.json()) as GoogleTranslateResponse;
  const translated = Array.isArray(data?.[0])
    ? data[0].map((part) => part?.[0] || "").join("")
    : "";
  return normalizeText(translated);
}

async function translateWithEdge(text: string): Promise<string> {
  if (!edgeAuthToken) {
    const authResponse = await fetch(edgeAuthEndpoint, {
      headers: {
        accept: "text/plain, */*",
        "user-agent": "Mozilla/5.0",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!authResponse.ok) throw new Error(`edge auth HTTP ${authResponse.status}`);
    edgeAuthToken = normalizeText(await authResponse.text());
  }

  const url = new URL(edgeTranslateEndpoint);
  url.searchParams.set("api-version", "3.0");
  url.searchParams.set("from", "en");
  url.searchParams.set("to", "zh-Hans");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${edgeAuthToken}`,
      "content-type": "application/json",
      "x-clienttraceid": randomUUID(),
    },
    body: JSON.stringify([{ Text: text.slice(0, 1800) }]),
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 401 || response.status === 403) edgeAuthToken = "";
  if (!response.ok) throw new Error(`edge translate HTTP ${response.status}`);
  const data = (await response.json()) as EdgeTranslateResponse;
  return normalizeText(data[0]?.translations?.[0]?.text);
}

async function translateWithMyMemory(text: string): Promise<string> {
  const url = new URL(myMemoryEndpoint);
  url.searchParams.set("langpair", "en|zh-CN");
  url.searchParams.set("q", text.slice(0, 480));
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`mymemory translate HTTP ${response.status}`);
  const data = (await response.json()) as MyMemoryResponse;
  return normalizeText(data.responseData?.translatedText);
}

async function translateWithLibre(text: string, endpoint: string): Promise<string> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      q: text.slice(0, 1800),
      source: "en",
      target: "zh",
      format: "text",
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`libre translate HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("json")) throw new Error("libre translate returned non-json response");
  const data = (await response.json()) as LibreTranslateResponse;
  return normalizeText(data.translatedText);
}

function translateProviders(): TranslateProvider[] {
  const customProviders = customTranslateEndpoints().map((endpoint, index) => ({
    name: `Custom Free Translate ${index + 1}`,
    translate: (text: string) => translateWithGoogle(text, endpoint),
  }));
  return [
    ...customProviders,
    {
      name: "Google Translate Free Endpoint",
      translate: (text) => translateWithGoogle(text),
    },
    {
      name: "Edge Translate Public Endpoint",
      translate: translateWithEdge,
    },
    {
      name: "MyMemory Free Translate",
      translate: translateWithMyMemory,
    },
    ...libreTranslateEndpoints.map((endpoint, index) => ({
      name: `LibreTranslate Free Endpoint ${index + 1}`,
      translate: (text: string) => translateWithLibre(text, endpoint),
    })),
  ];
}

export async function translateText(input: string): Promise<TranslateResult> {
  const text = normalizeText(input);
  if (!text) return { text: "", providerName: "empty" };

  const errors: string[] = [];
  for (const provider of translateProviders()) {
    try {
      const translated = await provider.translate(text);
      if (translated) return { text: translated, providerName: provider.name };
    } catch (error) {
      errors.push(`${provider.name}: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }
  throw new Error(`all free translate providers failed: ${errors.join("; ")}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function translateArticleWithFreeApi(article: NewsArticle): Promise<FreeArticleTranslation> {
  const paragraphs = articleBody(article);
  const summary = normalizeText(article.aiSummary || article.summary);
  const keyPoints = (article.keyPointsEn?.length ? article.keyPointsEn : article.aiKeyPoints || [])
    .map(normalizeText)
    .filter(Boolean)
    .slice(0, 5);
  const [titleResult, ...bodyResults] = await mapWithConcurrency(
    [article.title, summary, ...keyPoints, ...paragraphs],
    3,
    (text) => translateText(text).catch(() => ({ text: "", providerName: "" })),
  );
  const summaryResult = bodyResults.shift() || { text: "", providerName: "" };
  const keyPointResults = bodyResults.splice(0, keyPoints.length);
  const titleZh = titleResult.text;
  const summaryZh = summaryResult.text;
  const keyPointsZh = keyPointResults.map((result) => result.text);
  const providerNames = [titleResult, summaryResult, ...keyPointResults, ...bodyResults]
    .map((result) => result.providerName)
    .filter(Boolean);
  const bodyZh = bodyResults.map((result) => result.text);
  if (!titleZh && !summaryZh && !keyPointsZh.some(Boolean) && !bodyZh.some(Boolean)) {
    throw new Error("free translate returned empty result");
  }
  return {
    titleZh,
    summaryZh,
    keyPointsZh,
    bodyZh,
    providerName: [...new Set(providerNames)].join(" + ") || "Free Translate API",
  };
}
