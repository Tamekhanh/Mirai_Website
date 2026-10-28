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
import { sendMessage, checkServerStatus } from '../../services/chatApi'
import VRMLoadingScreen from '../../components/VRMLoadingScreen'

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
	IdleFallback: [''],
}

const EMOTION_EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']

const CHAT_STORAGE_KEY = 'mirai-chat-messages'
const MAX_STORED_MESSAGES = 50
const HISTORY_MESSAGES = 12 // 6 hỏi–đáp gần nhất
const EMOTION_HOLD_MS = 5000
const HEALTH_POLL_MS = 60000

const GREETING_MESSAGE = {
	id: 1,
	sender: 'mirai',
	text: 'Xin chào! Mình là Mirai. Rất vui được gặp bạn nhé!',
}

// Dự phòng khi backend không trả `emotion`; backend mới đã tự suy ra cảm xúc tiếng Việt.
// Không chắc thì trả về null (giữ nguyên nét mặt hiện tại). \b không dùng được với chữ có dấu
// nên dùng lookaround theo Unicode.
const word = (list) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join('|')})(?![\\p{L}\\p{N}])`, 'iu')
const EMOTION_RULES = [
	['surprised', word(['ồ', 'ôi', 'úi', 'wow', 'trời ơi', 'thật sao', 'bất ngờ', 'không ngờ'])],
	['angry', word(['tức giận', 'bực mình', 'giận', 'ghét', 'khó chịu', 'quá đáng'])],
	['sad', word(['buồn', 'rất tiếc', 'thất vọng', 'tuyệt vọng', 'cô đơn', 'khóc', 'đau lòng', 'rất nhớ', 'huhu']), /T_T|;_;|😢|😭/],
	['happy', word(['haha', 'hihi', 'hehe', 'vui', 'mừng', 'tuyệt vời', 'cảm ơn', 'hân hạnh', 'dễ thương']), /:\)|😊|😄|😁|\^_\^/],
	['relaxed', word(['bình tĩnh', 'thư giãn', 'yên tâm', 'đừng lo', 'đừng buồn', 'không sao', 'ổn thôi']), /😌/],
]

const detectEmotion = (text) => {
	const normalized = String(text ?? '').normalize('NFC')
	const match = EMOTION_RULES.find(([, ...patterns]) => patterns.some((pattern) => pattern.test(normalized)))
	return match ? match[0] : null
}

const getErrorMessageText = (error) => {
	if (error?.name === 'ChatTimeoutError') {
		return 'Xin lỗi, máy chủ phản hồi quá lâu. Có thể Mirai đang thức dậy, bạn thử lại sau một phút nhé.'
	}

	switch (error?.status) {
		case 413:
			return 'Tin nhắn dài quá, bạn thử rút gọn rồi gửi lại nhé.'
		case 429:
			return 'Bạn gửi hơi nhanh, đợi một chút rồi thử lại nhé.'
		case 502:
		case 503:
		case 504:
			return 'Mirai đang khởi động hoặc đang bận, bạn thử lại sau chút nhé.'
		default:
			return 'Xin lỗi, mình chưa kết nối được máy chủ. Bạn thử lại sau nhé.'
	}
}

const loadStoredMessages = () => {
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

const buildHistory = (messages) =>
	messages
		.filter((message) => !message.pending && !message.isError && message.id !== GREETING_MESSAGE.id)
		.slice(-HISTORY_MESSAGES)
		.map((message) => ({
			role: message.sender === 'user' ? 'user' : 'assistant',
			content: message.text,
		}))

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

// Harden the VRM's cel-shading on every MToon material:
//   shadingToony = 0  (shade softness 0  -> hard edge, no toon softness)
//   shadingShift = -1 (shading area -1   -> push lit/unlit boundary into shadow)
// "shading hardness 1" is the hard end of the same dial as softness, so toony = 0
// already gives maximum hardness.
const applyVrmShadingPreset = (vrm) => {
	if (!vrm?.scene) {
		return
	}

	vrm.scene.traverse((node) => {
		if (!node?.isMesh) {
			return
		}

		const materials = Array.isArray(node.material) ? node.material : [node.material]

		materials.forEach((material) => {
			if (!material) {
				return
			}

			const isMToon =
				typeof material.shadingToony === 'number' &&
				typeof material.shadingShift === 'number'

			if (!isMToon) {
				return
			}

			material.shadingToony = 0
			material.shadingShift = -1
			material.needsUpdate = true
		})
	})
}

function Mirai_chat() {
	const canvasRef = useRef(null)
	const sceneRef = useRef(null)
	const currentVrmRef = useRef(null)
	const loadVersionRef = useRef(0)
	const vrmLastProgressRef = useRef(-1)
	const timerRef = useRef(new THREE.Timer())
	const lookTargetRef = useRef(new THREE.Object3D())
	const isThinkingRef = useRef(false)
	const nodStartRef = useRef(-Infinity)
	const frameIdRef = useRef(null)
	const loaderHideTimeoutRef = useRef(null)
	const activeAudioRef = useRef(null)
	const animationMixerRef = useRef(null)
	const currentAnimationActionRef = useRef(null)
	const finishedAnimationListenerRef = useRef(null)
	const idleTransitionTimeoutRef = useRef(null)
	const animationPlayVersionRef = useRef(0)
	const messagesEndRef = useRef(null)
	const chatAbortRef = useRef(null)
	const emotionTimeoutRef = useRef(null)
	const [messages, setMessages] = useState(loadStoredMessages)
	const [draftMessage, setDraftMessage] = useState('')
	const [isLoading, setIsLoading] = useState(false)

	useEffect(() => {
		isThinkingRef.current = isLoading
	}, [isLoading])
	const [online_status, setOnlineStatus] = useState('Offline')
	const [vrmLoadingProgress, setVrmLoadingProgress] = useState(0)
	const [vrmLoadingError, setVrmLoadingError] = useState(false)
	const [shouldShowVrmLoader, setShouldShowVrmLoader] = useState(true)
	const [showBlendShapeDebug, setShowBlendShapeDebug] = useState(false)
	const [availableBlendShapes, setAvailableBlendShapes] = useState([])
	const [blendShapeValues, setBlendShapeValues] = useState({})
	const [isAudioMuted, setIsAudioMuted] = useState(false)
	const [webglFailed, setWebglFailed] = useState(false)

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
			if (document.hidden) {
				return
			}

			const isOnline = await checkServerStatus()
			setOnlineStatus(isOnline ? 'Online' : 'Offline')
		}

		checkStatus()
		const statusInterval = setInterval(checkStatus, HEALTH_POLL_MS)
		document.addEventListener('visibilitychange', checkStatus)

		return () => {
			clearInterval(statusInterval)
			document.removeEventListener('visibilitychange', checkStatus)
		}
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
			applyVrmShadingPreset(vrm)

			sceneRef.current.add(vrm.scene)
			currentVrmRef.current = vrm

			if (vrm.lookAt) {
				vrm.lookAt.target = lookTargetRef.current
			}

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

		// Chat must keep working even when WebGL is unavailable or blocked.
		let renderer
		try {
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
		} catch (error) {
			console.error('WebGL is not available:', error)
			setWebglFailed(true)
			setShouldShowVrmLoader(false)
			return undefined
		}

		const handleContextLost = (event) => {
			event.preventDefault()
			setWebglFailed(true)
		}
		const handleContextRestored = () => setWebglFailed(false)
		canvas.addEventListener('webglcontextlost', handleContextLost)
		canvas.addEventListener('webglcontextrestored', handleContextRestored)

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

		const maxPixelRatio = window.matchMedia('(pointer: coarse)').matches ? 1.5 : 2
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio))
		renderer.outputColorSpace = THREE.SRGBColorSpace

		const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.2)
		hemiLight.position.set(0, 2, 0)
		scene.add(hemiLight)

		const dirLight = new THREE.DirectionalLight(0xffffff, 1.8)
		dirLight.position.set(1, 2, 2)
		scene.add(dirLight)

		// Rim light from behind gives the avatar an outline that separates it from the backdrop.
		const rimLight = new THREE.DirectionalLight(0x9ec5ff, 0.9)
		rimLight.position.set(-1.5, 2.2, -1.5)
		scene.add(rimLight)

		const grid = new THREE.GridHelper(8, 16, 0x334155, 0x1e293b)
		grid.position.y = 0
		scene.add(grid)

		// Soft floating dust motes for depth.
		const PARTICLE_COUNT = 60
		const particlePositions = new Float32Array(PARTICLE_COUNT * 3)
		const particleSpeeds = new Float32Array(PARTICLE_COUNT)
		for (let i = 0; i < PARTICLE_COUNT; i += 1) {
			particlePositions[i * 3] = (Math.random() - 0.5) * 2.4
			particlePositions[i * 3 + 1] = 0.8 + Math.random() * 1.6
			particlePositions[i * 3 + 2] = -0.8 + Math.random() * 1.6
			particleSpeeds[i] = 0.015 + Math.random() * 0.03
		}
		const particleGeometry = new THREE.BufferGeometry()
		particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3))
		const particleMaterial = new THREE.PointsMaterial({
			color: 0xffffff,
			size: 0.012,
			transparent: true,
			opacity: 0.45,
			depthWrite: false,
			sizeAttenuation: true,
		})
		const particles = new THREE.Points(particleGeometry, particleMaterial)
		scene.add(particles)

		// Eyes follow the pointer; the target idles in front of the camera.
		const lookTarget = lookTargetRef.current
		const lookRestPosition = new THREE.Vector3(0, 1.5, 2)
		const lookDesiredPosition = lookRestPosition.clone()
		lookTarget.position.copy(lookRestPosition)
		scene.add(lookTarget)

		const handlePointerMove = (event) => {
			const rect = canvas.getBoundingClientRect()
			if (rect.width === 0 || rect.height === 0) {
				return
			}
			const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1
			const normalizedY = ((event.clientY - rect.top) / rect.height) * 2 - 1
			lookDesiredPosition.set(
				clamp01((normalizedX + 1) / 2) * 2 - 1,
				1.5 - Math.max(-1, Math.min(1, normalizedY)) * 0.5,
				2
			)
		}
		const handlePointerLeave = () => lookDesiredPosition.copy(lookRestPosition)
		window.addEventListener('pointermove', handlePointerMove)
		document.addEventListener('pointerleave', handlePointerLeave)

		// Procedural blinking: layered on top of whatever animation is playing.
		const BLINK_DURATION = 0.18
		let elapsedTime = 0
		let nextBlinkAt = 2 + Math.random() * 3
		let blinkProgress = -1

		// Procedural body motion: small additive offsets on normalized bones, applied after the
		// animation mixer so it layers on top of any clip (or on the rest pose if none plays).
		// Each bone remembers what it applied last frame so the offset never accumulates when the
		// mixer has no track for that bone.
		const boneStates = new WeakMap()
		const offsetEuler = new THREE.Euler()
		const offsetQuaternion = new THREE.Quaternion()
		let thinkingWeight = 0
		let speakingWeight = 0

		const applyBoneOffset = (vrm, boneName, x, y, z) => {
			const bone = vrm.humanoid?.getNormalizedBoneNode(boneName)
			if (!bone) {
				return
			}

			let state = boneStates.get(bone)
			if (!state) {
				state = { applied: new THREE.Quaternion(), inverse: new THREE.Quaternion(), active: false }
				boneStates.set(bone, state)
			}

			if (state.active && bone.quaternion.angleTo(state.applied) < 1e-5) {
				bone.quaternion.multiply(state.inverse)
			}

			offsetQuaternion.setFromEuler(offsetEuler.set(x, y, z))
			bone.quaternion.multiply(offsetQuaternion)
			state.applied.copy(bone.quaternion)
			state.inverse.copy(offsetQuaternion).invert()
			state.active = true
		}

		const applyProceduralMotion = (vrm, time, delta) => {
			const blend = 1 - Math.exp(-4 * delta)
			thinkingWeight += ((isThinkingRef.current ? 1 : 0) - thinkingWeight) * blend

			const audio = activeAudioRef.current
			const isSpeaking = Boolean(audio && !audio.paused && !audio.ended && !audio.muted)
			speakingWeight += ((isSpeaking ? 1 : 0) - speakingWeight) * blend

			const breath = Math.sin(time * 1.7)
			const nodAge = (performance.now() - nodStartRef.current) / 1000
			const nod = nodAge >= 0 && nodAge < 0.7 ? Math.sin((nodAge / 0.7) * Math.PI) * 0.12 : 0
			const talkBob = speakingWeight * (Math.sin(time * 6.5) * 0.02 + Math.sin(time * 3.1) * 0.015)

			const headPitch = Math.sin(time * 0.43) * 0.015 + talkBob + nod - thinkingWeight * 0.04
			const headYaw = Math.sin(time * 0.5) * 0.04 + thinkingWeight * 0.15
			const headRoll = Math.sin(time * 0.37) * 0.02 + thinkingWeight * 0.1

			applyBoneOffset(vrm, 'spine', breath * 0.006, 0, 0)
			applyBoneOffset(vrm, 'chest', breath * 0.012, Math.sin(time * 0.5) * 0.01, 0)
			applyBoneOffset(vrm, 'upperChest', breath * 0.008, 0, 0)
			applyBoneOffset(vrm, 'neck', headPitch * 0.4, headYaw * 0.4, headRoll * 0.4)
			applyBoneOffset(vrm, 'head', headPitch * 0.6, headYaw * 0.6, headRoll * 0.6)
		}

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
		const resizeObserver = new ResizeObserver(updateSize)
		if (canvas.parentElement) {
			resizeObserver.observe(canvas.parentElement)
		}
		timerRef.current.connect(window.document)
		timerRef.current.reset()

		let isOnScreen = true
		const visibilityObserver = new IntersectionObserver(([entry]) => {
			isOnScreen = entry.isIntersecting
		})
		visibilityObserver.observe(canvas)

		const animate = () => {
			timerRef.current.update()
			if (!isOnScreen || document.hidden) {
				frameIdRef.current = window.requestAnimationFrame(animate)
				return
			}

			const delta = Math.min(timerRef.current.getDelta(), 0.1)
			elapsedTime += delta

			lookTarget.position.lerp(lookDesiredPosition, 1 - Math.exp(-6 * delta))

			const positions = particleGeometry.attributes.position
			for (let i = 0; i < PARTICLE_COUNT; i += 1) {
				let y = positions.getY(i) + particleSpeeds[i] * delta
				if (y > 2.4) {
					y = 0.8
				}
				positions.setY(i, y)
			}
			positions.needsUpdate = true

			if (animationMixerRef.current) {
				animationMixerRef.current.update(delta)
			}

			if (currentVrmRef.current?.humanoid) {
				applyProceduralMotion(currentVrmRef.current, elapsedTime, delta)
				currentVrmRef.current.humanoid.update()
			}

			if (currentVrmRef.current) {
				const expressionManager = currentVrmRef.current.expressionManager
				if (expressionManager) {
					if (blinkProgress < 0 && elapsedTime >= nextBlinkAt) {
						blinkProgress = 0
					}
					if (blinkProgress >= 0) {
						blinkProgress += delta / BLINK_DURATION
						const done = blinkProgress >= 1
						expressionManager.setValue('blink', done ? 0 : Math.sin(blinkProgress * Math.PI))
						if (done) {
							blinkProgress = -1
							nextBlinkAt = elapsedTime + 2 + Math.random() * 4
						}
					}
				}
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
			resizeObserver.disconnect()
			window.removeEventListener('pointermove', handlePointerMove)
			document.removeEventListener('pointerleave', handlePointerLeave)
			scene.remove(lookTarget)
			particleGeometry.dispose()
			particleMaterial.dispose()
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
			visibilityObserver.disconnect()
			canvas.removeEventListener('webglcontextlost', handleContextLost)
			canvas.removeEventListener('webglcontextrestored', handleContextRestored)
			renderer.dispose()
		}
	}, [])

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })

		try {
			const persistable = messages.filter((message) => !message.pending).slice(-MAX_STORED_MESSAGES)
			window.localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(persistable))
		} catch {
			// localStorage unavailable: chat still works, just not persisted
		}
	}, [messages])

	useEffect(() => {
		return () => {
			chatAbortRef.current?.abort()

			if (emotionTimeoutRef.current) {
				window.clearTimeout(emotionTimeoutRef.current)
				emotionTimeoutRef.current = null
			}

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

			// Giá trị không phải object (ví dụ "X" của backend cũ) nghĩa là miệng đóng.
			const cueEntries = cueValue && typeof cueValue === 'object' ? Object.entries(cueValue) : []
			cueEntries.forEach(([shape, amount]) => {
				const expressionName = resolveExpressionName(shape)
				const current = frameValues[expressionName] ?? 0
				frameValues[expressionName] = Math.max(current, clamp01(Number(amount) || 0))
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
					handleResetBlendShapes()
					return
				}

				const currentTime = getCueTime()
				const activeCue = cues.find((cue) => currentTime >= cue.start && currentTime < cue.end)

				if (activeCue?.value) {
					const frameValues = getCueFrameValues(activeCue.value)
					Object.entries(frameValues).forEach(([shape, amount]) => {
						handleBlendShapeChange(shape, amount)
					})
				} else {
					handleResetBlendShapes()
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

	const sendText = async (nextText, baseMessages) => {
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

			nodStartRef.current = performance.now()
			const emotion = EMOTION_EXPRESSIONS.includes(reply.emotion)
				? reply.emotion
				: detectEmotion(reply.text)
			if (emotion) {
				setAnimationExpression(emotion)
				if (emotionTimeoutRef.current) {
					window.clearTimeout(emotionTimeoutRef.current)
				}
				emotionTimeoutRef.current = window.setTimeout(() => {
					setAnimationExpression('')
					emotionTimeoutRef.current = null
				}, EMOTION_HOLD_MS)
			}

			if (reply.audio) {
				void playAudioWithLipSync(reply.audio, reply.lipSync)
			}
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
		setMessages([GREETING_MESSAGE])
	}

	const handleInputKeyDown = (event) => {
		if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
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
					<canvas
						ref={canvasRef}
						className="chat-canvas"
						role="img"
						aria-label="3D avatar of Mirai"
					/>
					{webglFailed && (
						<div className="webgl-fallback" role="alert">
							The 3D avatar can't be shown because WebGL is unavailable. You can still chat with Mirai.
						</div>
					)}
					{import.meta.env.DEV && (
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
					)}
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
						<button
							type='button'
							className='mute-slide'
							onClick={handleClearConversation}
							aria-label='Clear conversation'
						>
							<span className='mute-slide-label'>Clear</span>
						</button>
						<div style={{ display: 'flex', alignItems: 'center' }}>
						<div className='status-color' style={{ backgroundColor: online_status === 'Online' ? '#22c55e' : '#ef4444' }} />
						<div className='status-text'>{online_status}</div>
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
								{message.text}
								{message.isError && message.retryText && (
									<button
										type='button'
										className='bubble-retry'
										onClick={() => handleRetryMessage(message)}
										disabled={isLoading}
									>
										Retry
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
						placeholder='Type your message...'
						value={draftMessage}
						onChange={(event) => setDraftMessage(event.target.value)}
						onKeyDown={handleInputKeyDown}
						aria-label='Message to Mirai'
						readOnly={isLoading}
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