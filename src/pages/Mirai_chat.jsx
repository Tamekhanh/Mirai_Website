import { useEffect, useRef, useState } from 'react'
import './Mirai_chat.css'

import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import {
	VRMAnimationLoaderPlugin,
	VRMLookAtQuaternionProxy,
	createVRMAnimationClip,
} from '@pixiv/three-vrm-animation'
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

const LIP_SHAPE_ALIASES = {
	A: ['aa', 'A'],
	E: ['ee', 'E'],
	I: ['ih', 'I'],
	O: ['oh', 'O'],
	U: ['ou', 'U'],
	aa: ['aa', 'A'],
	ee: ['ee', 'E'],
	ih: ['ih', 'I'],
	oh: ['oh', 'O'],
	ou: ['ou', 'U'],
}

const AnimationURLs = {
	Welcome: `${import.meta.env.BASE_URL}Mirai_Assets/Animation/VRMA_02.vrma`,
	Idle: `${import.meta.env.BASE_URL}Mirai_Assets/Animation/Idle.fbx`,
}

const AnimationWithExpression = {
	Welcome: ['happy', AnimationURLs.Welcome],
	Idle: ['', AnimationURLs.Idle],
	IdleFallback: ['', AnimationURLs.Welcome],
}

const EMOTION_EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']

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

const stabilizeVrmMeshes = (vrm) => {
	if (!vrm?.scene) {
		return
	}

	vrm.scene.traverse((node) => {
		if (!node?.isMesh) {
			return
		}

		// Skinned meshes in animated avatars can be incorrectly frustum-culled.
		node.frustumCulled = false
	})
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
	const activeAudioRef = useRef(null)
	const animationMixerRef = useRef(null)
	const currentAnimationActionRef = useRef(null)
	const finishedAnimationListenerRef = useRef(null)
	const idleTransitionTimeoutRef = useRef(null)
	const animationPlayVersionRef = useRef(0)
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
	const [isAudioMuted, setIsAudioMuted] = useState(false)

	const applyBlendShapeValues = (nextValues) => {
		const expressionManager = currentVrmRef.current?.expressionManager
		if (!expressionManager || typeof expressionManager.setValue !== 'function') {
			return
		}

		Object.entries(nextValues).forEach(([name, value]) => {
			expressionManager.setValue(name, clamp01(value))
		})
	}

	const resetAnimationState = () => {
		animationPlayVersionRef.current += 1

		if (idleTransitionTimeoutRef.current) {
			window.clearTimeout(idleTransitionTimeoutRef.current)
			idleTransitionTimeoutRef.current = null
		}

		const mixer = animationMixerRef.current
		if (mixer) {
			if (finishedAnimationListenerRef.current) {
				mixer.removeEventListener('finished', finishedAnimationListenerRef.current)
				finishedAnimationListenerRef.current = null
			}

			if (currentAnimationActionRef.current) {
				currentAnimationActionRef.current.stop()
				currentAnimationActionRef.current = null
			}

			mixer.stopAllAction()
			if (currentVrmRef.current?.scene) {
				mixer.uncacheRoot(currentVrmRef.current.scene)
			}
		}

		animationMixerRef.current = null
	}

	const setAnimationExpression = (expressionName) => {
		const expressionManager = currentVrmRef.current?.expressionManager
		if (!expressionManager || typeof expressionManager.setValue !== 'function') {
			return
		}

		const availableShapes = new Set(getAvailableBlendShapes(expressionManager))
		const nextValues = {}

		EMOTION_EXPRESSIONS.forEach((name) => {
			if (availableShapes.has(name)) {
				nextValues[name] = 0
			}
		})

		if (expressionName && availableShapes.has(expressionName)) {
			nextValues[expressionName] = 0.5
		}

		if (Object.keys(nextValues).length === 0) {
			return
		}

		setBlendShapeValues((previousValues) => ({
			...previousValues,
			...nextValues,
		}))
		applyBlendShapeValues(nextValues)
	}

	const loadAnimationClip = async (animationUrl, vrm) => {
		const lowerCaseUrl = animationUrl.toLowerCase()

		const ensureLookAtQuaternionProxy = () => {
			if (!vrm?.lookAt || !vrm?.scene) {
				return
			}

			const existingProxy = vrm.scene.children.find(
				(child) => child instanceof VRMLookAtQuaternionProxy
			)

			if (existingProxy) {
				if (!existingProxy.name) {
					existingProxy.name = 'VRMLookAtQuaternionProxy'
				}
				return
			}

			const lookAtProxy = new VRMLookAtQuaternionProxy(vrm.lookAt)
			lookAtProxy.name = 'VRMLookAtQuaternionProxy'
			vrm.scene.add(lookAtProxy)
		}

		if (lowerCaseUrl.endsWith('.vrma')) {
			const loader = new GLTFLoader()
			loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

			const gltf = await new Promise((resolve, reject) => {
				loader.load(animationUrl, resolve, undefined, reject)
			})

			const vrmAnimation = gltf.userData?.vrmAnimations?.[0]
			if (!vrmAnimation) {
				throw new Error(`No VRM animation data found in ${animationUrl}`)
			}

			ensureLookAtQuaternionProxy()

			return createVRMAnimationClip(vrmAnimation, vrm)
		}

		if (lowerCaseUrl.endsWith('.fbx')) {
			const loader = new FBXLoader()
			const object3d = await new Promise((resolve, reject) => {
				loader.load(animationUrl, resolve, undefined, reject)
			})

			const rawClip = object3d.animations?.[0]
			if (!rawClip) {
				throw new Error(`No animation clip found in ${animationUrl}`)
			}

			const vrmNodeNames = new Set()
			vrm.scene.traverse((node) => {
				if (node.name) {
					vrmNodeNames.add(node.name)
				}
			})

			const compatibleTracks = rawClip.tracks.filter((track) => {
				const targetNodeName = track.name.split('.')[0]
				return vrmNodeNames.has(targetNodeName)
			})

			if (compatibleTracks.length === 0) {
				throw new Error(`FBX clip is not compatible with this VRM rig: ${animationUrl}`)
			}

			return new THREE.AnimationClip(rawClip.name || 'fbx_clip', rawClip.duration, compatibleTracks)
		}

		throw new Error(`Unsupported animation format: ${animationUrl}`)
	}

	const playAnimationWithExpression = async (animationName, options = {}) => {
		const { skipIdleFallback = false } = options
		const animationConfig = AnimationWithExpression[animationName]
		if (!animationConfig) {
			return
		}

		const [expressionName, animationUrl] = animationConfig
		setAnimationExpression(expressionName)

		const vrm = currentVrmRef.current
		if (!vrm?.scene) {
			return
		}

		const playVersion = ++animationPlayVersionRef.current

		if (!animationMixerRef.current || animationMixerRef.current.getRoot() !== vrm.scene) {
			animationMixerRef.current = new THREE.AnimationMixer(vrm.scene)
		}

		const mixer = animationMixerRef.current

		if (finishedAnimationListenerRef.current) {
			mixer.removeEventListener('finished', finishedAnimationListenerRef.current)
			finishedAnimationListenerRef.current = null
		}

		if (currentAnimationActionRef.current) {
			currentAnimationActionRef.current.stop()
			currentAnimationActionRef.current = null
		}

		try {
			const clip = await loadAnimationClip(animationUrl, vrm)
			if (playVersion !== animationPlayVersionRef.current || currentVrmRef.current !== vrm) {
				return
			}

			const playableClip = clip.clone()
			playableClip.resetDuration()

			const action = mixer.clipAction(playableClip)
			action.reset()
			action.enabled = true
			action.paused = false
			action.timeScale = 1
			action.setEffectiveWeight(1)

			const isIdleAnimation = animationName === 'Idle' || animationName === 'IdleFallback'
			action.setLoop(isIdleAnimation ? THREE.LoopRepeat : THREE.LoopOnce, isIdleAnimation ? Infinity : 1)
			action.clampWhenFinished = !isIdleAnimation
			action.play()
			currentAnimationActionRef.current = action

			if (idleTransitionTimeoutRef.current) {
				window.clearTimeout(idleTransitionTimeoutRef.current)
				idleTransitionTimeoutRef.current = null
			}

			if (!isIdleAnimation) {
				const moveToIdle = () => {
					if (playVersion !== animationPlayVersionRef.current || currentVrmRef.current !== vrm) {
						return
					}

					void playAnimationWithExpression('Idle')
				}

				const clipDurationMs = Math.max(action.getClip().duration * 1000, 100)
				idleTransitionTimeoutRef.current = window.setTimeout(() => {
					idleTransitionTimeoutRef.current = null
					moveToIdle()
				}, clipDurationMs + 50)

				const handleFinished = (event) => {
					if (event.action !== action) {
						return
					}

					mixer.removeEventListener('finished', handleFinished)
					if (finishedAnimationListenerRef.current === handleFinished) {
						finishedAnimationListenerRef.current = null
					}

					if (idleTransitionTimeoutRef.current) {
						window.clearTimeout(idleTransitionTimeoutRef.current)
						idleTransitionTimeoutRef.current = null
					}

					moveToIdle()
				}

				finishedAnimationListenerRef.current = handleFinished
				mixer.addEventListener('finished', handleFinished)
			}
		} catch (error) {
			if (animationName === 'Idle' && !skipIdleFallback) {
				console.warn('Idle.fbx is incompatible. Falling back to VRMA idle loop.')
				void playAnimationWithExpression('IdleFallback', { skipIdleFallback: true })
				return
			}

			console.error(`Cannot play animation \"${animationName}\":`, error)
		}
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
				resetAnimationState()
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
			stabilizeVrmMeshes(vrm)

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
			void playAnimationWithExpression('Welcome')

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
		timerRef.current.connect(window.document)
		timerRef.current.reset()

		const animate = () => {
			timerRef.current.update()
			const delta = Math.min(timerRef.current.getDelta(), 0.1)
			if (animationMixerRef.current) {
				animationMixerRef.current.update(delta)
			}

			if (currentVrmRef.current?.humanoid) {
				currentVrmRef.current.humanoid.update()
			}

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
				resetAnimationState()
				scene.remove(currentVrmRef.current.scene)
				VRMUtils.deepDispose(currentVrmRef.current.scene)
				currentVrmRef.current = null
			}

			controls.dispose()
			if (backgroundTexture) {
				backgroundTexture.dispose()
			}
			timerRef.current.dispose()
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

			if (activeAudioRef.current) {
				activeAudioRef.current.pause()
				activeAudioRef.current = null
			}
		}
	}, [])

	useEffect(() => {
		if (activeAudioRef.current) {
			activeAudioRef.current.muted = isAudioMuted
		}
	}, [isAudioMuted])

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

	const resolveAudioSrc = (audioData) => {
		if (typeof audioData !== 'string' || !audioData.trim()) {
			return null
		}

		if (/^(https?:|data:|blob:)/i.test(audioData)) {
			return audioData
		}

		return `data:audio/mpeg;base64,${audioData}`
	}

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

			Object.entries(cueValue || {}).forEach(([shape, amount]) => {
				const expressionName = resolveExpressionName(shape)
				const current = frameValues[expressionName] ?? 0
				frameValues[expressionName] = Math.max(current, clamp01(Number(amount) || 0))
			})

			return frameValues
		}

		if (cues.length > 0) {
			const updateLipSync = () => {
				if (audio.paused || audio.ended) {
					handleResetBlendShapes()
					return
				}

				const currentTime = audio.currentTime
				const activeCue = cues.find((cue) => currentTime >= cue.start && currentTime < cue.end)

				if (activeCue?.value) {
					const frameValues = getCueFrameValues(activeCue.value)
					Object.entries(frameValues).forEach(([shape, amount]) => {
						handleBlendShapeChange(shape, amount)
					})
				} else {
					handleResetBlendShapes()
				}

				requestAnimationFrame(updateLipSync)
			}

			audio.addEventListener('play', () => {
				requestAnimationFrame(updateLipSync)
			})
		}

		audio.addEventListener('ended', handleResetBlendShapes)
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
			handleResetBlendShapes()
		})
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
				text: reply.text,
			}

			setMessages((prevMessages) =>
				prevMessages.map((msg) => (msg.id === loadingMessageId ? serverMessage : msg))
			)

			if (reply.audio) {
				void playAudioWithLipSync(reply.audio, reply.lipSync)
			}
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
					<div className='title-chat-controls'>
						<button
							type='button'
							className='mute-slide'
							aria-label={isAudioMuted ? 'Unmute Mirai voice' : 'Mute Mirai voice'}
							aria-pressed={isAudioMuted}
							onClick={() => setIsAudioMuted((prev) => !prev)}
						>
							<span className={`mute-slide-track ${isAudioMuted ? 'is-muted' : 'is-unmuted'}`}>
								<span className='mute-slide-thumb' />
							</span>
							<span className='mute-slide-label'>{isAudioMuted ? 'Muted' : 'Sound On'}</span>
						</button>
						<div style={{ display: 'flex', alignItems: 'center' }}>
						<div className='status-color' style={{ backgroundColor: online_status === 'Online' ? '#22c55e' : '#ef4444' }} />
						<div className='status-text'>{online_status}</div>
						</div>
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