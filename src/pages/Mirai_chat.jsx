import { useEffect, useRef, useState } from 'react'
import './Mirai_chat.css'

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { sendMessage, checkServerStatus } from '../services/chatApi'
import VRMLoadingScreen from '../components/VRMLoadingScreen'

const DEFAULT_VRM_PATH = `${import.meta.env.BASE_URL}Mirai_Assets/Mirai_Model_casual.vrm`

const DEFAULT_IMG_BACKGROUND = `${import.meta.env.BASE_URL}Mirai_Assets/room.png`

const DEFAULT_BLEND_SHAPE_PRESETS = [
	'neutral',
	'happy',
	'angry',
	'sad',
	'relaxed',
	'surprised',
	'aa',
	'ih',
	'ou',
	'ee',
	'oh',
	'blink',
	'blinkLeft',
	'blinkRight',
]

const clamp01 = (value) => Math.min(1, Math.max(0, value))

const getAvailableBlendShapes = (expressionManager) => {
	if (!expressionManager) {
		return []
	}

	const names = new Set()

	if (expressionManager.expressionMap && typeof expressionManager.expressionMap === 'object') {
		Object.keys(expressionManager.expressionMap).forEach((name) => names.add(name))
	}

	if (expressionManager._expressionMap && typeof expressionManager._expressionMap === 'object') {
		Object.keys(expressionManager._expressionMap).forEach((name) => names.add(name))
	}

	if (Array.isArray(expressionManager.expressions)) {
		expressionManager.expressions.forEach((expression) => {
			if (expression?.expressionName) {
				names.add(expression.expressionName)
			}
		})
	}

	DEFAULT_BLEND_SHAPE_PRESETS.forEach((name) => names.add(name))

	return Array.from(names)
}

function Mirai_chat() {
	const canvasRef = useRef(null)
	const sceneRef = useRef(null)
	const currentVrmRef = useRef(null)
	const loadVersionRef = useRef(0)
	const vrmLastProgressRef = useRef(-1)
	const timerRef = useRef(new THREE.Timer())
	const frameIdRef = useRef(null)
	const loaderHideTimeoutRef = useRef(null)
	const messagesEndRef = useRef(null)
	const [messages, setMessages] = useState([
		{
			id: 1,
			sender: 'mirai',
			text: "Hello! I'm Mirai, your virtual assistant. How can I help you today?",
		},
	])
	const [draftMessage, setDraftMessage] = useState('')
	const [isLoading, setIsLoading] = useState(false)
	const [online_status, setOnlineStatus] = useState('Offline')
	const [vrmLoadingProgress, setVrmLoadingProgress] = useState(0)
	const [vrmLoadingError, setVrmLoadingError] = useState(false)
	const [shouldShowVrmLoader, setShouldShowVrmLoader] = useState(true)
	const [showBlendShapeDebug, setShowBlendShapeDebug] = useState(false)
	const [availableBlendShapes, setAvailableBlendShapes] = useState([])
	const [blendShapeValues, setBlendShapeValues] = useState({})

	const applyBlendShapeValues = (nextValues) => {
		const expressionManager = currentVrmRef.current?.expressionManager
		if (!expressionManager || typeof expressionManager.setValue !== 'function') {
			return
		}

		Object.entries(nextValues).forEach(([name, value]) => {
			expressionManager.setValue(name, clamp01(value))
		})
	}

	// Check server status on mount and periodically
	useEffect(() => {
		const checkStatus = async () => {
			const isOnline = await checkServerStatus()
			setOnlineStatus(isOnline ? 'Online' : 'Offline')
		}

		checkStatus()
		const statusInterval = setInterval(checkStatus, 60000) // Check every 60 seconds (reduced from 10 seconds)

		return () => clearInterval(statusInterval)
	}, [])

	const loadVrmFromUrl = async ({ url, revokeAfterLoad = false }) => {
		if (!sceneRef.current) {
			return
		}

		const loadVersion = ++loadVersionRef.current
		vrmLastProgressRef.current = -1
		setVrmLoadingProgress(0)
		setVrmLoadingError(false)
		setShouldShowVrmLoader(true)
		if (loaderHideTimeoutRef.current) {
			window.clearTimeout(loaderHideTimeoutRef.current)
			loaderHideTimeoutRef.current = null
		}

		try {
			const loader = new GLTFLoader()
			loader.register((parser) => new VRMLoaderPlugin(parser))

			// Track loading progress
			const gltf = await new Promise((resolve, reject) => {
				loader.load(
					url,
					(gltf) => {
						if (vrmLastProgressRef.current !== 100) {
							vrmLastProgressRef.current = 100
							setVrmLoadingProgress(100)
						}
						resolve(gltf)
					},
					(progress) => {
						const total = progress.total || 1
						const progressPercent = Math.round((progress.loaded / total) * 90)
						if (progressPercent !== vrmLastProgressRef.current) {
							vrmLastProgressRef.current = progressPercent
							setVrmLoadingProgress(progressPercent)
						}
					},
					(error) => {
						reject(error)
					}
				)
			})

			if (loadVersion !== loadVersionRef.current || !sceneRef.current) {
				return
			}

			if (currentVrmRef.current) {
				sceneRef.current.remove(currentVrmRef.current.scene)
				VRMUtils.deepDispose(currentVrmRef.current.scene)
				currentVrmRef.current = null
			}

			const vrm = gltf.userData.vrm
			if (!vrm) {
				throw new Error('No VRM data found in file.')
			}

			if (loadVersion !== loadVersionRef.current || !sceneRef.current) {
				VRMUtils.deepDispose(vrm.scene)
				return
			}

			VRMUtils.rotateVRM0(vrm)
			vrm.scene.rotation.y = 0
			vrm.scene.position.set(0, 0.2, 0)

			sceneRef.current.add(vrm.scene)
			currentVrmRef.current = vrm

			const names = getAvailableBlendShapes(vrm.expressionManager)
			setAvailableBlendShapes(names)
			setBlendShapeValues((previousValues) => {
				const nextValues = {}
				names.forEach((name) => {
					nextValues[name] = clamp01(previousValues[name] ?? 0)
				})
				return nextValues
			})

			setVrmLoadingProgress(100)

			// Hide loader after successful load
			loaderHideTimeoutRef.current = window.setTimeout(() => {
				setShouldShowVrmLoader(false)
				loaderHideTimeoutRef.current = null
			}, 500)
		} catch (error) {
			console.error(error)
			setVrmLoadingError(true)
			setAvailableBlendShapes([])
			setBlendShapeValues({})
		} finally {
			if (revokeAfterLoad) {
				URL.revokeObjectURL(url)
			}
		}
	}

	const handleRetryVrmLoad = () => {
		setVrmLoadingError(false)
		setVrmLoadingProgress(0)
		void loadVrmFromUrl({ url: DEFAULT_VRM_PATH })
	}

	useEffect(() => {
		if (!canvasRef.current) {
			return undefined
		}

		const canvas = canvasRef.current
		const scene = new THREE.Scene()
		scene.background = new THREE.Color('#0f172a')
		let backgroundTexture = null
		const textureLoader = new THREE.TextureLoader()
		textureLoader.load(
			DEFAULT_IMG_BACKGROUND,
			(texture) => {
				texture.colorSpace = THREE.SRGBColorSpace
				scene.background = texture
				backgroundTexture = texture
			},
			undefined,
			() => {
				scene.background = new THREE.Color('#0f172a')
			}
		)
		sceneRef.current = scene

		const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100)
		camera.position.set(0, 1.55, 2)

		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		renderer.outputColorSpace = THREE.SRGBColorSpace

		const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.2)
		hemiLight.position.set(0, 2, 0)
		scene.add(hemiLight)

		const dirLight = new THREE.DirectionalLight(0xffffff, 1.8)
		dirLight.position.set(1, 2, 2)
		scene.add(dirLight)

		const grid = new THREE.GridHelper(8, 16, 0x334155, 0x1e293b)
		grid.position.y = 0
		scene.add(grid)

		const controls = new OrbitControls(camera, renderer.domElement)
		controls.enableDamping = true
		controls.target.set(0, 1.55, 0)
		controls.enableRotate = false
		controls.enableZoom = false
		controls.enablePan = false
		controls.update()

		const updateSize = () => {
			if (!canvas.parentElement) {
				return
			}

			const width = canvas.parentElement.clientWidth
			const height = canvas.parentElement.clientHeight
			renderer.setSize(width, height, false)
			camera.aspect = width / Math.max(height, 1)
			camera.updateProjectionMatrix()
		}

		updateSize()
		window.addEventListener('resize', updateSize)

		const animate = () => {
			const delta = timerRef.current.getDelta()
			if (currentVrmRef.current) {
				currentVrmRef.current.update(delta)
			}

			controls.update()
			renderer.render(scene, camera)
			frameIdRef.current = window.requestAnimationFrame(animate)
		}

		animate()
		void loadVrmFromUrl({ url: DEFAULT_VRM_PATH })

		return () => {
			loadVersionRef.current += 1
			window.removeEventListener('resize', updateSize)
			if (frameIdRef.current) {
				window.cancelAnimationFrame(frameIdRef.current)
			}

			if (currentVrmRef.current) {
				scene.remove(currentVrmRef.current.scene)
				VRMUtils.deepDispose(currentVrmRef.current.scene)
				currentVrmRef.current = null
			}

			controls.dispose()
			if (backgroundTexture) {
				backgroundTexture.dispose()
			}
			renderer.dispose()
		}
	}, [])

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
	}, [messages])

	useEffect(() => {
		return () => {
			if (loaderHideTimeoutRef.current) {
				window.clearTimeout(loaderHideTimeoutRef.current)
				loaderHideTimeoutRef.current = null
			}
		}
	}, [])

	const handleImport = async (event) => {
		const file = event.target.files?.[0]
		if (!file) {
			return
		}

		if (!file.name.toLowerCase().endsWith('.vrm')) {
			window.alert('Only .vrm files are supported.')
			event.target.value = ''
			return
		}

		const url = URL.createObjectURL(file)
		await loadVrmFromUrl({ url, revokeAfterLoad: true })
		event.target.value = ''
	}

	const handleSendMessage = async () => {
		const nextText = draftMessage.trim()
		if (!nextText || isLoading) {
			return
		}

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
			text: 'Mirai is typing...',
		}

		setMessages((prevMessages) => [...prevMessages, userMessage, loadingMessage])
		setDraftMessage('')
		setIsLoading(true)

		try {
			// Send message to server and get response
			const reply = await sendMessage(nextText)

			// Replace loading message with actual response
			const serverMessage = {
				id: loadingMessageId,
				sender: 'mirai',
				text: reply,
			}

			setMessages((prevMessages) =>
				prevMessages.map((msg) => (msg.id === loadingMessageId ? serverMessage : msg))
			)
		} catch (error) {
			console.error('Failed to send message:', error)
			const errorMessageText =
				error instanceof Error
					? error.message.includes('timeout') || error.message.includes('Request timeout')
						? 'Sorry, the server took too long to respond. Please check if the server is running and try again.'
						: `Sorry, I encountered an error: ${error.message}. Please try again later.`
					: 'Sorry, I encountered an unknown error. Please try again later.'

			// Replace loading message with error message
			const errorMessage = {
				id: loadingMessageId,
				sender: 'mirai',
				text: errorMessageText,
			}

			setMessages((prevMessages) =>
				prevMessages.map((msg) => (msg.id === loadingMessageId ? errorMessage : msg))
			)
		} finally {
			setIsLoading(false)
		}
	}

	const handleInputKeyDown = (event) => {
		if (event.key === 'Enter') {
			event.preventDefault()
			handleSendMessage()
		}
	}

	const handleBlendShapeChange = (name, value) => {
		const nextValue = clamp01(value)
		setBlendShapeValues((previousValues) => {
			if ((previousValues[name] ?? 0) === nextValue) {
				return previousValues
			}

			return {
				...previousValues,
				[name]: nextValue,
			}
		})

		const expressionManager = currentVrmRef.current?.expressionManager
		if (expressionManager && typeof expressionManager.setValue === 'function') {
			expressionManager.setValue(name, nextValue)
		}
	}

	const handleResetBlendShapes = () => {
		const nextValues = {}
		availableBlendShapes.forEach((name) => {
			nextValues[name] = 0
		})
		setBlendShapeValues(nextValues)
		applyBlendShapeValues(nextValues)
	}

	return (
		<div className="chat-container">
			<VRMLoadingScreen
				isLoading={shouldShowVrmLoader && !vrmLoadingError}
				progress={vrmLoadingProgress}
				isError={vrmLoadingError}
				onRetry={handleRetryVrmLoad}
				imageSrc={`${import.meta.env.BASE_URL}Mirai_Assets/LoadingLogo.png`}
			/>
			<div className='chat-viewer-panel'>
				<div className="chat-canvas-wrap">
					<canvas ref={canvasRef} className="chat-canvas" />
					<div className='blendshape-debug'>
						<div className='blendshape-debug-header'>
							<button
								type='button'
								className='blendshape-debug-toggle'
								onClick={() => setShowBlendShapeDebug((prev) => !prev)}
							>
								{showBlendShapeDebug ? 'Hide Blend Shape Debug' : 'Show Blend Shape Debug'}
							</button>
							{showBlendShapeDebug && (
								<button type='button' className='blendshape-debug-reset' onClick={handleResetBlendShapes}>
									Reset
								</button>
							)}
						</div>
						{showBlendShapeDebug && (
							<div className='blendshape-debug-body'>
								{availableBlendShapes.length === 0 && (
									<div className='blendshape-debug-empty'>No blend shapes detected.</div>
								)}
								{availableBlendShapes.map((name) => (
									<label key={name} className='blendshape-debug-row'>
										<span>{name}</span>
										<input
											type='range'
											min='0'
											max='1'
											step='0.01'
											value={blendShapeValues[name] ?? 0}
											onChange={(event) => handleBlendShapeChange(name, Number(event.target.value))}
										/>
										<span>{(blendShapeValues[name] ?? 0).toFixed(2)}</span>
									</label>
								))}
							</div>
						)}
					</div>
				</div>
			</div>
			<div className='chat-box'>
				<div className='title-chat-box'>
					<div className='chat'>Chat</div>
					<div style={{ display: 'flex', alignItems: 'center' }}>
						<div className='status-color' style={{ backgroundColor: online_status === 'Online' ? '#22c55e' : '#ef4444' }} />
						<div className='status-text'>{online_status}</div>
					</div>
				</div>
				<div className='chat-messages'>
					{messages.map((message) => (
						<div
							key={message.id}
							className={`message-row ${message.sender === 'user' ? 'message-row-user' : 'message-row-mirai'}`}
						>
							<div
								className={`bubble-message ${message.sender === 'user' ? 'bubble-message-user' : 'bubble-message-mirai'}`}
							>
								{message.text}
							</div>
						</div>
					))}
					<div ref={messagesEndRef} />
				</div>
				<div className='chat-input'>
					<input
						type='text'
						placeholder='Type your message...'
						value={draftMessage}
						onChange={(event) => setDraftMessage(event.target.value)}
						onKeyDown={handleInputKeyDown}
						disabled={isLoading}
					/>
					<button onClick={handleSendMessage} disabled={!draftMessage.trim() || isLoading}>
						{isLoading ? 'Sending...' : 'Send'}
					</button>
				</div>
			</div>
		</div>
	)
}

export default Mirai_chat