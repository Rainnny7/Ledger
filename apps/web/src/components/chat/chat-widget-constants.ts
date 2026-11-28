export const CHAT_API = "/api/banks/chat"
export const CHAT_TITLE_API = "/api/banks/chat/title"
export const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone

export const SUGGESTED_QUESTIONS = [
	"What did I spend on groceries last month?",
	"Which subscriptions am I paying for?",
	"How is my savings goal progressing?",
	"What were my biggest expenses this year?",
] as const
