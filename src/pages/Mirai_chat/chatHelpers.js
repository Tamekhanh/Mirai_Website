// Hàm thuần và hằng số của khung chat: không phụ thuộc React hay Three.js.
export const CHAT_STORAGE_KEY = 'mirai-chat-messages'
export const MAX_STORED_MESSAGES = 50
export const HISTORY_MESSAGES = 12 // 6 hỏi–đáp gần nhất

export const GREETING_MESSAGE = {
	id: 1,
	sender: 'mirai',
	text: 'Xin chào! Mình là Mirai. Rất vui được gặp bạn nhé!',
}

export const getErrorMessageText = (error) => {
	if (error?.name === 'ChatTimeoutError') {
		return 'Xin lỗi, máy chủ phản hồi quá lâu. Có thể Mirai đang thức dậy, bạn thử lại sau một phút nhé.'
	}

	switch (error?.status) {
		case 413:
			return 'Tin nhắn dài quá, bạn thử rút gọn rồi gửi lại nhé.'
		case 429:
			return 'Bạn gửi hơi nhanh, đợi một chút rồi thử lại nhé.'
		case 503:
			return error.retryAfter
				? `Mirai đang khởi động hoặc đang bận, bạn thử lại sau khoảng ${error.retryAfter} giây nhé.`
				: 'Mirai đang khởi động hoặc đang bận, bạn thử lại sau chút nhé.'
		case 502:
		case 504:
			return 'Mirai đang khởi động hoặc đang bận, bạn thử lại sau chút nhé.'
		default:
			return 'Xin lỗi, mình chưa kết nối được máy chủ. Bạn thử lại sau nhé.'
	}
}

export const loadStoredMessages = () => {
	try {
		const stored = JSON.parse(window.localStorage.getItem(CHAT_STORAGE_KEY) || 'null')
		if (Array.isArray(stored) && stored.length > 0) {
			return stored
				.filter(
					(message) =>
						message &&
						(message.sender === 'user' || message.sender === 'mirai') &&
						typeof message.text === 'string' &&
						!message.pending
				)
				// Lời chào cũ (tiếng Anh) được thay bằng lời chào hiện tại.
				.map((message) => (message.id === GREETING_MESSAGE.id ? GREETING_MESSAGE : message))
		}
	} catch {
		// localStorage unavailable or corrupted: start fresh
	}
	return [GREETING_MESSAGE]
}

export const buildHistory = (messages) =>
	messages
		.filter((message) => !message.pending && !message.isError && message.id !== GREETING_MESSAGE.id)
		.slice(-HISTORY_MESSAGES)
		.map((message) => ({
			role: message.sender === 'user' ? 'user' : 'assistant',
			content: message.text,
		}))

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/
const AUDIO_DATA_URI_PATTERN = /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/i

// Backend chỉ trả base64 của mp3. Không nhận http(s)/blob để nguồn audio ngoài không phát được.
export const resolveAudioSrc = (audioData) => {
	if (typeof audioData !== 'string') {
		return null
	}

	const trimmed = audioData.trim()
	if (AUDIO_DATA_URI_PATTERN.test(trimmed)) {
		return trimmed
	}

	return BASE64_PATTERN.test(trimmed) ? `data:audio/mpeg;base64,${trimmed}` : null
}
