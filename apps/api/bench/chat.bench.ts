import { appendFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { generateText, stepCountIs } from "ai"
import { prepareBenchDatabase } from "./seed-bench.ts"

const QUESTIONS = [
	"How much did I spend on food last month?",
	"What are my biggest subscriptions?",
	"Am I over budget anywhere this month?",
	"List my account balances.",
	"What were my largest purchases in the last 90 days?",
	"How much income did I receive this month?",
	"Show recent Netflix charges.",
	"How are my savings goals doing?",
	"Break down my spending by category this year.",
	"Give me a quick financial overview.",
] as const

const dumpArg = Bun.argv.includes("--dump")
const dumpPath =
	process.env.BENCH_CHAT_DUMP?.trim() ||
	(dumpArg
		? path.join(tmpdir(), `ledger-chat-bench-${Date.now()}.jsonl`)
		: "")

const { userId } = await prepareBenchDatabase(20_000)
const { benchChatQualityChecks, gradeChatAnswer } =
	await import("./chat-ground-truth.ts")
const { createChatTools } = await import("../src/chat/tools.ts")
const { buildChatSystemPrompt } = await import("../src/chat/system-prompt.ts")
const { aiChatLimits } = await import("../src/chat/limits.ts")

const baseUrl = process.env.AI_BASE_URL?.trim()
const apiKey = process.env.AI_API_KEY?.trim()
const modelId = process.env.AI_MODEL?.trim()

if (!baseUrl || !apiKey || !modelId) {
	console.log(
		"AI_API_KEY / AI_BASE_URL / AI_MODEL not set; skipping live chat bench."
	)
	process.exit(0)
}

const gateway = createOpenAICompatible({
	name: "ai-gateway",
	baseURL: baseUrl,
	apiKey,
})

console.log(
	"question\ttools\tsteps\tinput_tokens\toutput_tokens\twall_ms\tquality"
)

const qualityChecks = benchChatQualityChecks(userId)

for (const [index, question] of QUESTIONS.entries()) {
	const started = performance.now()
	const result = await generateText({
		model: gateway(modelId),
		system: buildChatSystemPrompt(),
		prompt: question,
		tools: createChatTools(userId),
		stopWhen: stepCountIs(aiChatLimits.maxToolStepsPerAnswer),
	})
	const toolNames = result.steps.flatMap((step) =>
		step.toolCalls.map((call) => call.toolName)
	)
	const usage = result.usage
	const quality = gradeChatAnswer(result.text, qualityChecks[index])
	if (dumpPath) {
		for (const [stepIndex, step] of result.steps.entries()) {
			const payload = {
				question,
				step: stepIndex,
				toolCalls: step.toolCalls.map((call) => ({
					name: call.toolName,
					input: call.input,
				})),
				toolResults: step.toolResults.map((row) => ({
					name: row.toolName,
					bytes: new TextEncoder().encode(JSON.stringify(row.output))
						.length,
				})),
			}
			appendFileSync(dumpPath, `${JSON.stringify(payload)}\n`)
		}
	}
	console.log(
		[
			question.replace(/\t/g, " "),
			toolNames.join(",") || "-",
			result.steps.length,
			usage.inputTokens ?? "",
			usage.outputTokens ?? "",
			Math.round(performance.now() - started),
			quality,
		].join("\t")
	)
}

if (dumpPath) {
	console.log(`tool dump: ${dumpPath}`)
}
