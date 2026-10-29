import { useEffect, useRef, useState } from 'react'
import { sendMessage } from '../../services/chatApi'
import {
	CHAT_STORAGE_KEY,
	GREETING_MESSAGE,
	MAX_STORED_MESSAGES,
	buildHistory,
	getErrorMessageText,
	loadStoredMessages,
} from './chatHelpers'

/**
 * Conversation state and the send / retry / clear flow. It knows nothing about the avatar:
 * the page wires `onUserMessage`, `onReply` and `onClear` to whatever should react.
 */
export const useChatSession = ({ onUserMessage, onReply, onClear }) => {
	const chatAbortRef = useRef(null)
	const [messages, setMessages] = useState(loadStoredMessages)
	const [draftMessage, setDraftMessage] = useState('')
	const [isLoading, setIsLoading] = useState(false)

	useEffect(() => {
		try {
			const persistable = messages.filter((message) => !message.pending).slice(-MAX_STORED_MESSAGES)
			window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(persistable))
		} catch {
			// localStorage unavailable: chat still works, just not persisted
		}
	}, [messages])

	useEffect(() => {
		const chatAbort = chatAbortRef
		return () => chatAbort.current?.abort()
	}, [])

	const sendText = async (nextText, baseMessages) => {
		if (!nextText || isLoading) {
			return
		}

		onUserMessage(nextText)

		const userMessage = {
			id: Date.now(),
			sender: 'user',
			text: nextText,
		}

		// Add loading message
		const loadingMessageId = Date.now() + 1
		const loadingMessage = {
			id: loadingMessageId,
			sender: 'mirai',
			text: 'Mirai đang gõ...',
			pending: true,
		}

		const history = buildHistory(baseMessages)
		const controller = new AbortController()
		chatAbortRef.current = controller

		setMessages([...baseMessages, userMessage, loadingMessage])
		setDraftMessage('')
		setIsLoading(true)

		try {
			// Send message (with recent history) to server and get response
			const reply = await sendMessage(nextText, { history, signal: controller.signal })

			// Replace loading message with actual response
			const serverMessage = {
				id: loadingMessageId,
				sender: 'mirai',
				text: reply.text,
			}

			setMessages((prevMessages) =>
				prevMessages.map((msg) => (msg.id === loadingMessageId ? serverMessage : msg))
			)

			onReply(reply)
		} catch (error) {
			if (error?.name === 'AbortError') {
				return
			}

			console.error('Failed to send message:', error)
			// Replace loading message with error message (keeps the text so it can be retried)
			const errorMessage = {
				id: loadingMessageId,
				sender: 'mirai',
				text: getErrorMessageText(error),
				isError: true,
				retryText: nextText,
				userMessageId: userMessage.id,
			}

			setMessages((prevMessages) =>
				prevMessages.map((msg) => (msg.id === loadingMessageId ? errorMessage : msg))
			)
		} finally {
			if (chatAbortRef.current === controller) {
				chatAbortRef.current = null
			}
			setIsLoading(false)
		}
	}

	const handleSendMessage = () => {
		const nextText = draftMessage.trim()
		if (!nextText || isLoading) {
			return
		}

		setDraftMessage('')
		void sendText(nextText, messages)
	}

	const handleRetryMessage = (failedMessage) => {
		if (isLoading || !failedMessage.retryText) {
			return
		}

		const baseMessages = messages.filter(
			(msg) => msg.id !== failedMessage.id && msg.id !== failedMessage.userMessageId
		)
		void sendText(failedMessage.retryText, baseMessages)
	}

	const handleClearConversation = () => {
		chatAbortRef.current?.abort()
		onClear()
		setMessages([GREETING_MESSAGE])
	}

	const handleInputKeyDown = (event) => {
		if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
			event.preventDefault()
			handleSendMessage()
		}
	}

	return {
		messages,
		draftMessage,
		setDraftMessage,
		isLoading,
		handleSendMessage,
		handleRetryMessage,
		handleClearConversation,
		handleInputKeyDown,
	}
}
