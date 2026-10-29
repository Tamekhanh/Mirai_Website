import { useEffect, useRef } from 'react'
import './Mirai_chat.css'

import VRMLoadingScreen from '../../components/VRMLoadingScreen'
import BlendShapeDebugPanel from './BlendShapeDebugPanel'
import ChatPanel from './ChatPanel'
import { LOADING_LOGO_SRC, isDebugMode } from './avatarConfig'
import { useChatSession } from './useChatSession'
import { useServerStatus } from './useServerStatus'
import { useSpeechPlayback } from './useSpeechPlayback'
import { useVrmAvatar } from './useVrmAvatar'

function Mirai_chat() {
	const canvasRef = useRef(null)
	const activeAudioRef = useRef(null)
	const avatar = useVrmAvatar({ canvasRef, activeAudioRef })
	const serverStatus = useServerStatus()

	const speech = useSpeechPlayback({
		activeAudioRef,
		availableBlendShapes: avatar.availableBlendShapes,
		onBlendShapeChange: avatar.handleBlendShapeChange,
		onResetBlendShapes: avatar.handleResetBlendShapes,
	})

	const chat = useChatSession({
		onUserMessage: avatar.reactToUserMessage,
		onReply: (reply) => {
			avatar.reactToReply(reply.emotion)
			speech.speakReply(reply)
		},
		onClear: speech.cancelPendingSpeech,
	})

	const { setThinking } = avatar
	useEffect(() => {
		setThinking(chat.isLoading)
	}, [setThinking, chat.isLoading])

	return (
		<div className="chat-container">
			<VRMLoadingScreen
				isLoading={avatar.shouldShowVrmLoader && !avatar.vrmLoadingError}
				progress={avatar.vrmLoadingProgress}
				isError={avatar.vrmLoadingError}
				onRetry={avatar.retryVrmLoad}
				imageSrc={LOADING_LOGO_SRC}
			/>
			<div className='chat-viewer-panel'>
				<div className="chat-canvas-wrap">
					<canvas
						ref={canvasRef}
						className="chat-canvas"
						role="img"
						aria-label="Nhân vật 3D của Mirai"
					/>
					{avatar.webglFailed && (
						<div className="webgl-fallback" role="alert">
							Không hiển thị được nhân vật 3D vì trình duyệt không hỗ trợ WebGL. Bạn vẫn có thể trò chuyện với Mirai.
						</div>
					)}
					{isDebugMode() && (
						<BlendShapeDebugPanel
							availableBlendShapes={avatar.availableBlendShapes}
							blendShapeValues={avatar.blendShapeValues}
							onChange={avatar.handleBlendShapeChange}
							onReset={avatar.handleResetBlendShapes}
						/>
					)}
				</div>
			</div>
			<ChatPanel
				messages={chat.messages}
				draftMessage={chat.draftMessage}
				isLoading={chat.isLoading}
				isAudioMuted={speech.isAudioMuted}
				serverStatus={serverStatus}
				onDraftChange={chat.setDraftMessage}
				onSend={chat.handleSendMessage}
				onKeyDown={chat.handleInputKeyDown}
				onRetry={chat.handleRetryMessage}
				onClear={chat.handleClearConversation}
				onToggleMute={speech.toggleMute}
			/>
		</div>
	)
}

export default Mirai_chat
