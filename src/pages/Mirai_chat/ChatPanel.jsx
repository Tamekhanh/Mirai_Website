import { useEffect, useRef } from 'react'
import { STATUS_COLORS } from './useServerStatus'

function ChatPanel({
	messages,
	draftMessage,
	isLoading,
	isAudioMuted,
	serverStatus,
	onDraftChange,
	onSend,
	onKeyDown,
	onRetry,
	onClear,
	onToggleMute,
}) {
	const messagesEndRef = useRef(null)

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	return (
		<div className='chat-box'>
			<div className='title-chat-box'>
				<div className='chat'>Mirai</div>
				<div className='title-chat-controls'>
					<button
						type='button'
						className='mute-slide'
						aria-label={isAudioMuted ? 'Bật giọng Mirai' : 'Tắt giọng Mirai'}
						aria-pressed={isAudioMuted}
						onClick={onToggleMute}
					>
						<span className={`mute-slide-track ${isAudioMuted ? 'is-muted' : 'is-unmuted'}`}>
							<span className='mute-slide-thumb' />
						</span>
						<span className='mute-slide-label'>{isAudioMuted ? 'Đã tắt tiếng' : 'Có tiếng'}</span>
					</button>
					<button
						type='button'
						className='mute-slide'
						onClick={onClear}
						aria-label='Xoá cuộc trò chuyện'
					>
						<span className='mute-slide-label'>Xoá</span>
					</button>
					<div style={{ display: 'flex', alignItems: 'center' }}>
						<div className='status-color' style={{ backgroundColor: STATUS_COLORS[serverStatus] }} />
						<div className='status-text'>{serverStatus}</div>
					</div>
				</div>
			</div>
			<div className='chat-messages' role='log' aria-live='polite'>
				{messages.map((message) => (
					<div
						key={message.id}
						className={`message-row ${message.sender === 'user' ? 'message-row-user' : 'message-row-mirai'}`}
					>
						<div
							className={`bubble-message ${message.sender === 'user' ? 'bubble-message-user' : 'bubble-message-mirai'}`}
						>
							<span className='sr-only'>{message.sender === 'user' ? 'Bạn: ' : 'Mirai: '}</span>
							{message.text}
							{message.isError && message.retryText && (
								<button
									type='button'
									className='bubble-retry'
									onClick={() => onRetry(message)}
									disabled={isLoading}
								>
									Thử lại
								</button>
							)}
						</div>
					</div>
				))}
				<div ref={messagesEndRef} />
			</div>
			<div className='chat-input'>
				<input
					type='text'
					placeholder='Nhắn gì đó cho Mirai…'
					value={draftMessage}
					onChange={(event) => onDraftChange(event.target.value)}
					onKeyDown={onKeyDown}
					aria-label='Tin nhắn gửi Mirai'
					readOnly={isLoading}
				/>
				<button onClick={onSend} disabled={!draftMessage.trim() || isLoading}>
					{isLoading ? 'Đang gửi…' : 'Gửi'}
				</button>
			</div>
		</div>
	)
}

export default ChatPanel
