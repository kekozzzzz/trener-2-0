import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { Agent, ProxyAgent } from "undici";
import {
  getAnthropicApiKey,
  getAnthropicBaseUrl,
  getAnthropicModel,
  getAnthropicProxyCa,
  getAnthropicProxySecret,
  getAnthropicProxyUrl,
} from "@/config/llm";
import { buildHandAnalysisPrompt, HAND_ANALYSIS_SYSTEM_PROMPT } from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionPrompt, DIALOGUE_QUESTION_SYSTEM_PROMPT } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt, VERDICT_SYSTEM_PROMPT } from "@/config/prompts/verdict";
import { buildChatReplyPrompt, CHAT_REPLY_SYSTEM_PROMPT } from "@/config/prompts/chat-reply";
import type {
  ChatReplyRequest,
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
  LlmPort,
  NextQuestionRequest,
  NextQuestionResult,
  VerdictRequest,
  VerdictResult,
} from "./types";

const MAX_TOKENS = 1024;

// Claude иногда оборачивает JSON в markdown-код-блок несмотря на инструкцию — снимаем его.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fenced ? fenced[1] : text).trim();
}

function validate(result: Partial<HandAnalysisResult>, request: HandAnalysisRequest): HandAnalysisResult {
  if (typeof result.played !== "string" || typeof result.optimal !== "string") {
    throw new Error("Claude вернул разбор без обязательных полей played/optimal");
  }

  if (request.importanceLevel === "CRITICAL") {
    if (typeof result.question !== "string" || typeof result.draftVerdict !== "string") {
      throw new Error("Claude вернул CRITICAL-разбор без question/draftVerdict");
    }
    return { played: result.played, optimal: result.optimal, question: result.question, draftVerdict: result.draftVerdict };
  }

  if (typeof result.note !== "string") {
    throw new Error(`Claude вернул ${request.importanceLevel}-разбор без note`);
  }
  return { played: result.played, optimal: result.optimal, note: result.note };
}

function validateVerdict(result: Partial<VerdictResult>): VerdictResult {
  if (typeof result.verdict !== "string") {
    throw new Error("Claude вернул вердикт без поля verdict");
  }
  return { verdict: result.verdict };
}

function validateNextQuestion(result: Partial<NextQuestionResult>): NextQuestionResult {
  if (typeof result.question !== "string") {
    throw new Error("Claude вернул ответ без поля question");
  }
  return { question: result.question };
}

function validateChatReply(result: Partial<ChatReplyResult>): ChatReplyResult {
  if (typeof result.reply !== "string") {
    throw new Error("Claude вернул ответ без поля reply");
  }
  return { reply: result.reply };
}

// CONNECT-прокси для обхода гео-блокировки Claude (см. getAnthropicProxyUrl).
// Логин/пароль (если заданы в URL) уходят в заголовок Proxy-Authorization;
// сам uri передаём без них, чтобы не зависеть от того, как разбирает userinfo undici.
function buildProxyDispatcher(proxyUrl: string): ProxyAgent {
  const url = new URL(proxyUrl);
  const uri = `${url.protocol}//${url.host}`;
  if (url.username || url.password) {
    const creds = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    const token = `Basic ${Buffer.from(creds).toString("base64")}`;
    return new ProxyAgent({ uri, token });
  }
  return new ProxyAgent({ uri });
}

// Клиент строим один раз: ключ и адрес прокси берутся из окружения процесса
// и в рантайме не меняются. ProxyAgent тоже переиспользуем (пул соединений).
let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const options: ConstructorParameters<typeof Anthropic>[0] = { apiKey: getAnthropicApiKey() };

  // Вариант 1 — наш HTTPS-релей (nginx-шлюз на VPS в Казахстане): SDK шлёт запросы на
  // baseURL, релей пересылает их к Anthropic с не-российского IP (снимает гео-блок 403).
  // Секрет подписывает запрос, чтобы релей не был открытым. Сертификат релея самоподписанный —
  // доверяем именно ему (пиннинг через ANTHROPIC_PROXY_CA), не отключая проверку TLS.
  const baseUrl = getAnthropicBaseUrl();
  if (baseUrl) {
    options.baseURL = baseUrl;
    // Канал РФ→релей капризен: переиспользование keepalive-соединений даёт случайные
    // "Connection error" — путь/NAT тихо роняет простаивающее соединение между запросами,
    // undici этого не видит и шлёт по дохлому. Поэтому почти сразу закрываем простаивающие
    // соединения (keepAliveTimeout) и не пайплайним — каждый запрос идёт по свежему
    // соединению, как одиночный curl (он 100% надёжен). Плюс ретраи на стороне SDK.
    const caPath = getAnthropicProxyCa();
    if (caPath) {
      options.fetchOptions = {
        dispatcher: new Agent({
          connect: { ca: readFileSync(caPath, "utf8") },
          pipelining: 0,
          keepAliveTimeout: 10,
          keepAliveMaxTimeout: 10,
        }),
      } as unknown as typeof options.fetchOptions;
    }
    options.maxRetries = 5;
    const proxySecret = getAnthropicProxySecret();
    if (proxySecret) {
      options.defaultHeaders = { "x-proxy-secret": proxySecret };
    }
  }

  // Вариант 2 — CONNECT-прокси (туннель к зарубежному VPS). Оставлен как запасной путь.
  const proxyUrl = getAnthropicProxyUrl();
  if (proxyUrl) {
    options.fetchOptions = {
      dispatcher: buildProxyDispatcher(proxyUrl),
    } as unknown as typeof options.fetchOptions;
  }

  cachedClient = new Anthropic(options);
  return cachedClient;
}

async function callClaude(system: string, prompt: string): Promise<unknown> {
  const client = getClient();

  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: prompt }],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude вернул ответ без текстового блока");
  }

  try {
    return JSON.parse(extractJson(textBlock.text));
  } catch {
    throw new Error("Claude вернул невалидный JSON");
  }
}

export const anthropicLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest): Promise<HandAnalysisResult> {
    const parsed = await callClaude(HAND_ANALYSIS_SYSTEM_PROMPT, buildHandAnalysisPrompt(request));
    return validate(parsed as Partial<HandAnalysisResult>, request);
  },

  async generateNextQuestion(request: NextQuestionRequest): Promise<NextQuestionResult> {
    const parsed = await callClaude(DIALOGUE_QUESTION_SYSTEM_PROMPT, buildDialogueQuestionPrompt(request));
    return validateNextQuestion(parsed as Partial<NextQuestionResult>);
  },

  async generateVerdict(request: VerdictRequest): Promise<VerdictResult> {
    const parsed = await callClaude(VERDICT_SYSTEM_PROMPT, buildVerdictPrompt(request));
    return validateVerdict(parsed as Partial<VerdictResult>);
  },

  async generateChatReply(request: ChatReplyRequest): Promise<ChatReplyResult> {
    const parsed = await callClaude(CHAT_REPLY_SYSTEM_PROMPT, buildChatReplyPrompt(request));
    return validateChatReply(parsed as Partial<ChatReplyResult>);
  },
};
