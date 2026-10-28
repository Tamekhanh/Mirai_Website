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
import { fetchSpeech, sendMessage } from '../../services/chatApi'
import VRMLoadingScreen from '../../components/VRMLoadingScreen'
import { retargetMixamoClip } from './mixamoRetarget'
import {
	CHAT_STORAGE_KEY,
	GREETING_MESSAGE,
	MAX_STORED_MESSAGES,
	buildHistory,
	getErrorMessageText,
	loadStoredMessages,
	resolveAudioSrc,
} from './chatHelpers'
import { getAvailableBlendShapes, stabilizeVrmMeshes } from './vrmHelpers'
import { STATUS_COLORS, useServerStatus } from './useServerStatus'

const DEFAULT_VRM_PATH = `${import.meta.env.BASE_URL}Mirai_Assets/Mirai_Model_casual.vrm`

const DEFAULT_IMG_BACKGROUND = `${import.meta.env.BASE_URL}Mirai_Assets/room.png`

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
}

const EMOTION_EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']

const EMOTION_HOLD_MS = 5000
const REST_ARM_DROP = 1.2 // rad: hạ cánh tay từ T-pose xuống dáng đứng tự nhiên
const REST_ELBOW_BEND = 0.2
const ANIMATION_FADE_SECONDS = 0.5 // crossfade giữa các clip, tránh nhảy tư thế đột ngột
const EXPRESSION_EASE = 5 // tốc độ làm mượt nét mặt (1/giây)
const IDLE_SMILE = 0.14 // nét cười rất nhẹ khi không có cảm xúc nào đang giữ: mặt trung tính hoàn toàn trông vô hồn

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
	const speechAbortRef = useRef(null)
	const emotionTimeoutRef = useRef(null)
	const emotionActiveRef = useRef('') // tên nét mặt cảm xúc đang giữ, rỗng nếu không có
	const emotionLevelsRef = useRef({}) // giá trị đã làm mượt đang áp lên từng nét mặt
	const clipCacheRef = useRef(new Map())
	const fadeOutTimeoutRef = useRef(null)
	const [messages, setMessages] = useState(loadStoredMessages)
	const [draftMessage, setDraftMessage] = useState('')
	const [isLoading, setIsLoading] = useState(false)

	useEffect(() => {
		isThinkingRef.current = isLoading
	}, [isLoading])
	const online_status = useServerStatus()
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
		clipCacheRef.current.clear()
		if (fadeOutTimeoutRef.current) {
			window.clearTimeout(fadeOutTimeoutRef.current)
			fadeOutTimeoutRef.current = null
		}
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
		emotionActiveRef.current = expressionName && availableShapes.has(expressionName) ? expressionName : ''

		if (Object.keys(nextValues).length === 0) {
			return
		}

		// Chỉ cập nhật mục tiêu (và panel debug): vòng render sẽ làm mượt giá trị thật để nét mặt không giật.
		setBlendShapeValues((previousValues) => ({
			...previousValues,
			...nextValues,
		}))
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

			// FBX từ Mixamo: tên xương khác VRM nên phải retarget sang humanoid của VRM.
			return retargetMixamoClip(object3d, vrm)
		}

		throw new Error(`Unsupported animation format: ${animationUrl}`)
	}

	// Clip được cache theo VRM + URL: trước đây mỗi lần chuyển animation lại tải và parse lại FBX.
	const getAnimationClip = (animationUrl, vrm) => {
		const key = vrm.scene.uuid + '|' + animationUrl
		const cache = clipCacheRef.current
		if (!cache.has(key)) {
			const pending = loadAnimationClip(animationUrl, vrm)
			cache.set(key, pending)
			pending.catch(() => cache.delete(key))
		}
		return cache.get(key)
	}

	const playAnimationWithExpression = async (animationName) => {
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

		try {
			// Giữ clip hiện tại chạy trong lúc tải clip mới (trước đây bị dừng ngay nên avatar rơi về tư thế nghỉ).
			const clip = await getAnimationClip(animationUrl, vrm)
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
			const previousAction = currentAnimationActionRef.current

			const isIdleAnimation = animationName === 'Idle'
			action.setLoop(isIdleAnimation ? THREE.LoopRepeat : THREE.LoopOnce, isIdleAnimation ? Infinity : 1)
			action.clampWhenFinished = !isIdleAnimation
			action.play()
			if (previousAction && previousAction !== action) {
				action.crossFadeFrom(previousAction, ANIMATION_FADE_SECONDS, false)
				const fadingClip = previousAction.getClip()
				if (fadeOutTimeoutRef.current) {
					window.clearTimeout(fadeOutTimeoutRef.current)
				}
				fadeOutTimeoutRef.current = window.setTimeout(() => {
					fadeOutTimeoutRef.current = null
					previousAction.stop()
					mixer.uncacheAction(fadingClip, vrm.scene)
				}, ANIMATION_FADE_SECONDS * 1000 + 100)
			} else {
				action.fadeIn(ANIMATION_FADE_SECONDS)
			}
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

				const clipDurationMs = Math.max(action.getClip().duration * 1000 - ANIMATION_FADE_SECONDS * 1000, 100)
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
			console.error(`Cannot play animation "${animationName}":`, error)
		}
	}

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
				// Tải sẵn clip Idle trong lúc clip chào đang chạy để lúc chuyển không bị khựng chờ tải.
				void getAnimationClip(AnimationURLs.Idle, vrm).catch(() => {})

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

		// Lighting follows the room backdrop: warm afternoon sun through the window on the right,
		// wood-floor bounce from below, and a faint cool sky fill on the shadow side. Neutral white
		// light against a warm room is what made the face look pale and pasted-on.
		const hemiLight = new THREE.HemisphereLight(0xfff9f2, 0x7a5a42, 0.95)
		hemiLight.position.set(0, 2, 0)
		scene.add(hemiLight)

		const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5)
		dirLight.position.set(2, 1.8, 1.6)
		scene.add(dirLight)

		const fillLight = new THREE.DirectionalLight(0xd2e2ff, 0.45)
		fillLight.position.set(-1.6, 1.2, 2)
		scene.add(fillLight)

		// Rim light from behind gives the avatar an outline that separates it from the backdrop.
		const rimLight = new THREE.DirectionalLight(0xffe4c8, 0.6)
		rimLight.position.set(1.5, 2.2, -1.5)
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
		

		// Saccade: mắt thỉnh thoảng đảo nhẹ quanh điểm đang nhìn, người thật không bao giờ nhìn đứng yên.
		const saccade = new THREE.Vector3()
		const lookGoal = new THREE.Vector3()
		let nextSaccadeAt = 1

		// Procedural body motion: small additive offsets on normalized bones, applied after the
		// animation mixer so it layers on top of any clip (or on the rest pose if none plays).
		// Each bone remembers what it applied last frame so the offset never accumulates when the
		// mixer has no track for that bone.
		const boneStates = new WeakMap()
		const offsetEuler = new THREE.Euler()
		const offsetQuaternion = new THREE.Quaternion()
		let thinkingWeight = 0
		let restPoseWeight = 1
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

			// Không có clip nào đang chạy (tải lỗi / chưa tải xong): hạ tay xuống thay vì đứng dang tay kiểu T-pose.
			restPoseWeight += ((currentAnimationActionRef.current ? 0 : 1) - restPoseWeight) * blend

			const breath = Math.sin(time * 1.7)
			const nodAge = (performance.now() - nodStartRef.current) / 1000
			const nod = nodAge >= 0 && nodAge < 0.7 ? Math.sin((nodAge / 0.7) * Math.PI) * 0.12 : 0
			const talkBob = speakingWeight * (Math.sin(time * 6.5) * 0.02 + Math.sin(time * 3.1) * 0.015)

			const headPitch = Math.sin(time * 0.43) * 0.015 + talkBob + nod - thinkingWeight * 0.04
			const headYaw = Math.sin(time * 0.5) * 0.04 + thinkingWeight * 0.15
			const headRoll = Math.sin(time * 0.37) * 0.02 + thinkingWeight * 0.1

			applyBoneOffset(vrm, 'leftUpperArm', 0, 0, -REST_ARM_DROP * restPoseWeight)
			applyBoneOffset(vrm, 'rightUpperArm', 0, 0, REST_ARM_DROP * restPoseWeight)
			applyBoneOffset(vrm, 'leftLowerArm', 0, 0, -REST_ELBOW_BEND * restPoseWeight)
			applyBoneOffset(vrm, 'rightLowerArm', 0, 0, REST_ELBOW_BEND * restPoseWeight)
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

			if (elapsedTime >= nextSaccadeAt) {
				saccade.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.07, 0)
				nextSaccadeAt = elapsedTime + 0.5 + Math.random() * 2.5
			}
			lookGoal.copy(lookDesiredPosition).add(saccade)
			lookTarget.position.lerp(lookGoal, 1 - Math.exp(-8 * delta))

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
				// Nét mặt cảm xúc + nụ cười nền: làm mượt về giá trị mục tiêu thay vì đổi tức thì.
				if (expressionManager) {
					const ease = 1 - Math.exp(-EXPRESSION_EASE * delta)
					const held = emotionActiveRef.current
					EMOTION_EXPRESSIONS.forEach((name) => {
						let target = name === held ? 0.5 : 0
						if (!held && name === 'happy') {
							target = IDLE_SMILE + Math.sin(elapsedTime * 0.4) * 0.03
						}
						const level = emotionLevelsRef.current[name] ?? 0
						const next = level + (target - level) * ease
						emotionLevelsRef.current[name] = next
						expressionManager.setValue(name, next)
					})
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
			speechAbortRef.current?.abort()

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
			// Backend quyết định cảm xúc; null nghĩa là không có tín hiệu rõ nên giữ nguyên nét mặt.
			const emotion = EMOTION_EXPRESSIONS.includes(reply.emotion) ? reply.emotion : null
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
			} else {
				// Chữ đã hiện; lấy audio sau để không bắt người dùng chờ TTS cùng với LLM.
				speechAbortRef.current?.abort()
				const speechController = new AbortController()
				speechAbortRef.current = speechController
				void fetchSpeech(reply.text, { signal: speechController.signal }).then((speech) => {
					if (speech && !speechController.signal.aborted) {
						void playAudioWithLipSync(speech.audio, speech.lipSync)
					}
				})
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
		speechAbortRef.current?.abort()
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
						<div className='status-color' style={{ backgroundColor: STATUS_COLORS[online_status] }} />
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