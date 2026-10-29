import { useEffect, useRef, useState } from 'react'
import { fetchSpeech } from '../../services/chatApi'
import { resolveAudioSrc } from './chatHelpers'
import { LIP_SHAPE_ALIASES, LIP_SYNC_GAIN, clamp01 } from './avatarConfig'

const resolveLipSyncData = async (lipSyncPayload) => {
	if (!lipSyncPayload) {
		return null
	}

	if (typeof lipSyncPayload === 'string') {
		const response = await fetch(lipSyncPayload)
		if (!response.ok) {
			throw new Error(`Failed to load blend shape file: ${response.status}`)
		}
		return response.json()
	}

	return lipSyncPayload
}

/**
 * Plays Mirai's voice and drives the mouth blend shapes from the lip-sync cues.
 * `activeAudioRef` is shared with the avatar hook, which reads it to know when Mirai is speaking.
 */
export const useSpeechPlayback = ({
	activeAudioRef,
	availableBlendShapes,
	onBlendShapeChange,
	onResetBlendShapes,
}) => {
	const speechAbortRef = useRef(null)
	const [isAudioMuted, setIsAudioMuted] = useState(false)

	useEffect(() => {
		const speechAbort = speechAbortRef
		const activeAudio = activeAudioRef
		return () => {
			speechAbort.current?.abort()

			if (activeAudio.current) {
				activeAudio.current.pause()
				activeAudio.current = null
			}
		}
	}, [activeAudioRef])

	useEffect(() => {
		if (activeAudioRef.current) {
			activeAudioRef.current.muted = isAudioMuted
		}
	}, [activeAudioRef, isAudioMuted])

	const playAudioWithLipSync = async (audioData, lipSyncPayload) => {
		const audioSrc = resolveAudioSrc(audioData)
		if (!audioSrc) {
			return
		}

		if (activeAudioRef.current) {
			activeAudioRef.current.pause()
			activeAudioRef.current = null
		}

		const audio = new Audio(audioSrc)
		audio.muted = isAudioMuted
		activeAudioRef.current = audio
		let lipSyncData = null

		try {
			lipSyncData = await resolveLipSyncData(lipSyncPayload)
		} catch (error) {
			console.error('Cannot load blend shape file:', error)
		}

		const cues = Array.isArray(lipSyncData?.mouthCues) ? lipSyncData.mouthCues : []
		const availableShapesSet = new Set(availableBlendShapes)
		const lipShapeKeys = Object.keys(LIP_SHAPE_ALIASES)

		const resolveExpressionName = (shapeName) => {
			const aliases = LIP_SHAPE_ALIASES[shapeName] || [shapeName]
			const matchedName = aliases.find((candidate) => availableShapesSet.has(candidate))
			return matchedName || aliases[0]
		}

		const getCueFrameValues = (cueValue) => {
			const frameValues = {}

			lipShapeKeys.forEach((shapeName) => {
				frameValues[resolveExpressionName(shapeName)] = 0
			})

			// Giá trị không phải object (ví dụ "X" của backend cũ) nghĩa là miệng đóng.
			const cueEntries = cueValue && typeof cueValue === 'object' ? Object.entries(cueValue) : []
			cueEntries.forEach(([shape, amount]) => {
				const expressionName = resolveExpressionName(shape)
				const current = frameValues[expressionName] ?? 0
				frameValues[expressionName] = Math.max(current, clamp01((Number(amount) || 0) * LIP_SYNC_GAIN))
			})

			return frameValues
		}

		if (cues.length > 0) {
			let lipSyncFrameId = null

			// Mốc theo từ (source "word") đã chính xác; chỉ co giãn khi mốc là ước lượng
			// và độ lệch nhỏ (0.85-1.15), tránh trôi cue.
			const getCueTime = () => {
				const expected = Number(lipSyncData?.metadata?.duration)
				const source = lipSyncData?.metadata?.source
				if (source === 'word' || !Number.isFinite(audio.duration) || !(expected > 0)) {
					return audio.currentTime
				}
				const ratio = audio.duration / expected
				return ratio > 0.85 && ratio < 1.15 ? audio.currentTime / ratio : audio.currentTime
			}

			const updateLipSync = () => {
				lipSyncFrameId = null
				if (audio.paused || audio.ended || activeAudioRef.current !== audio) {
					onResetBlendShapes()
					return
				}

				const currentTime = getCueTime()
				const activeCue = cues.find((cue) => currentTime >= cue.start && currentTime < cue.end)

				if (activeCue?.value) {
					const frameValues = getCueFrameValues(activeCue.value)
					Object.entries(frameValues).forEach(([shape, amount]) => {
						onBlendShapeChange(shape, amount)
					})
				} else {
					onResetBlendShapes()
				}

				lipSyncFrameId = requestAnimationFrame(updateLipSync)
			}

			// Chỉ giữ một vòng lặp: phát lại hoặc pause/play không tạo thêm vòng song song.
			audio.addEventListener('play', () => {
				if (lipSyncFrameId === null) {
					lipSyncFrameId = requestAnimationFrame(updateLipSync)
				}
			})
		}

		audio.addEventListener('ended', onResetBlendShapes)
		audio.addEventListener('ended', () => {
			if (activeAudioRef.current === audio) {
				activeAudioRef.current = null
			}
		})
		audio.play().catch((error) => {
			console.error('Cannot play audio:', error)
			if (activeAudioRef.current === audio) {
				activeAudioRef.current = null
			}
			onResetBlendShapes()
		})
	}

	// Phát audio đi kèm câu trả lời; nếu backend không gửi kèm thì lấy riêng để chữ không phải chờ TTS.
	const speakReply = (reply) => {
		if (reply.audio) {
			void playAudioWithLipSync(reply.audio, reply.lipSync)
			return
		}

		speechAbortRef.current?.abort()
		const speechController = new AbortController()
		speechAbortRef.current = speechController
		void fetchSpeech(reply.text, { signal: speechController.signal }).then((speech) => {
			if (speech && !speechController.signal.aborted) {
				void playAudioWithLipSync(speech.audio, speech.lipSync)
			}
		})
	}

	const cancelPendingSpeech = () => {
		speechAbortRef.current?.abort()
	}

	const toggleMute = () => setIsAudioMuted((prev) => !prev)

	return { isAudioMuted, toggleMute, speakReply, cancelPendingSpeech }
}
