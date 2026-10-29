import { useCallback, useEffect, useRef, useState } from 'react'

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
import { retargetMixamoClip } from './mixamoRetarget'
import { GesturePlayer, GESTURES } from './gestures'
import { getAvailableBlendShapes, stabilizeVrmMeshes } from './vrmHelpers'
import { createProceduralMotion } from './proceduralMotion'
import { addRoomLighting, createDustMotes } from './sceneSetup'
import {
	ANIMATION_FADE_SECONDS,
	AnimationURLs,
	AnimationWithExpression,
	DEFAULT_IMG_BACKGROUND,
	DEFAULT_VRM_PATH,
	ALL_EMOTIONS,
	EMOTION_EXPRESSIONS,
	EMOTION_HOLD_MS,
	EMOTION_MIX,
	EXPRESSION_EASE,
	GESTURE_INTENSITY,
	GREETING_PATTERN,
	IDLE_SMILE,
	SPEAKING_EXPRESSION_DAMPING,
	clamp01,
	isDebugMode,
} from './avatarConfig'

/**
 * Owns everything about the 3D avatar: the Three.js scene and render loop, VRM loading,
 * animation clips, facial expressions and the blend-shape state used by lip-sync and the debug panel.
 * Chat code talks to it only through the returned actions (reactToUserMessage / reactToReply).
 * `canvasRef` and `activeAudioRef` are created by the caller: the audio ref is shared with the speech hook.
 */
export const useVrmAvatar = ({ canvasRef, activeAudioRef }) => {
	const sceneRef = useRef(null)
	const currentVrmRef = useRef(null)
	const loadVersionRef = useRef(0)
	const vrmLastProgressRef = useRef(-1)
	const timerRef = useRef(new THREE.Timer())
	const lookTargetRef = useRef(new THREE.Object3D())
	const isThinkingRef = useRef(false)
	const nodStartRef = useRef(-Infinity)
	const currentAnimationNameRef = useRef('')
	const [gesturePlayer] = useState(() => new GesturePlayer())
	const frameIdRef = useRef(null)
	const loaderHideTimeoutRef = useRef(null)
	const animationMixerRef = useRef(null)
	const currentAnimationActionRef = useRef(null)
	const finishedAnimationListenerRef = useRef(null)
	const idleTransitionTimeoutRef = useRef(null)
	const animationPlayVersionRef = useRef(0)
	const emotionTimeoutRef = useRef(null)
	const emotionActiveRef = useRef('') // tên nét mặt cảm xúc đang giữ, rỗng nếu không có
	const emotionLevelsRef = useRef({}) // giá trị đã làm mượt đang áp lên từng nét mặt
	const clipCacheRef = useRef(new Map())
	const fadeOutTimeoutRef = useRef(null)

	const [vrmLoadingProgress, setVrmLoadingProgress] = useState(0)
	const [vrmLoadingError, setVrmLoadingError] = useState(false)
	const [shouldShowVrmLoader, setShouldShowVrmLoader] = useState(true)
	const [availableBlendShapes, setAvailableBlendShapes] = useState([])
	const [blendShapeValues, setBlendShapeValues] = useState({})
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

		const mix = EMOTION_MIX[expressionName]
		if (mix) {
			Object.entries(mix).forEach(([name, value]) => {
				if (availableShapes.has(name)) {
					nextValues[name] = value
				}
			})
		} else if (expressionName && availableShapes.has(expressionName)) {
			nextValues[expressionName] = 0.5
		}
		emotionActiveRef.current = expressionName && (mix || availableShapes.has(expressionName)) ? expressionName : ''

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
		currentAnimationNameRef.current = animationName
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

	const retryVrmLoad = () => {
		setVrmLoadingError(false)
		setVrmLoadingProgress(0)
		void loadVrmFromUrl({ url: DEFAULT_VRM_PATH })
	}

	// Nhận File .vrm do người dùng chọn (xem trước model khác); trả về false nếu định dạng không hợp lệ.
	const importVrmFile = async (file) => {
		if (!file.name.toLowerCase().endsWith('.vrm')) {
			return false
		}

		await loadVrmFromUrl({ url: URL.createObjectURL(file), revokeAfterLoad: true })
		return true
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

		addRoomLighting(scene)
		const dustMotes = createDustMotes(scene)

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

		const proceduralMotion = createProceduralMotion({
			gesturePlayer,
			isThinkingRef,
			activeAudioRef,
			currentAnimationActionRef,
			nodStartRef,
		})

		gesturePlayer.setAmplitude(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.35 : 1)
		if (isDebugMode()) {
			window.__miraiGesturePlayer = gesturePlayer
			window.__miraiGestures = GESTURES
			window.__miraiVrm = () => currentVrmRef.current
			window.__miraiGesture = (name, intensity, freezeAt = null) => {
				gesturePlayer.freezeTime = freezeAt
				if (name) {
					gesturePlayer.play(name, intensity)
				}
			}
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
		const timer = timerRef.current
		timer.connect(window.document)
		timer.reset()

		let isOnScreen = true
		const visibilityObserver = new IntersectionObserver(([entry]) => {
			isOnScreen = entry.isIntersecting
		})
		visibilityObserver.observe(canvas)

		const tick = (delta) => {
			elapsedTime += delta

			if (elapsedTime >= nextSaccadeAt) {
				saccade.set((Math.random() - 0.5) * 0.12, (Math.random() - 0.5) * 0.07, 0)
				nextSaccadeAt = elapsedTime + 0.5 + Math.random() * 2.5
			}
			lookGoal.copy(lookDesiredPosition).add(saccade)
			lookTarget.position.lerp(lookGoal, 1 - Math.exp(-8 * delta))

			dustMotes.update(delta)

			if (animationMixerRef.current) {
				animationMixerRef.current.update(delta)
			}

			if (currentVrmRef.current?.humanoid) {
				proceduralMotion.apply(currentVrmRef.current, elapsedTime, delta)
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
					// Đang nói thì giảm các nét mặt làm miệng mở/kéo rộng (cười, ngạc nhiên...) để không chồng lên
					// khẩu hình, nếu không miệng sẽ toác ra. Cảm xúc vẫn thể hiện qua mắt, lông mày và cử chỉ cơ thể.
					const speakingAmount = Math.min(1, proceduralMotion.getSpeakingWeight() * 2.5)
					EMOTION_EXPRESSIONS.forEach((name) => {
						let target = name === held ? 0.5 : EMOTION_MIX[held]?.[name] ?? 0
						if (!held && name === 'happy') {
							target = IDLE_SMILE + Math.sin(elapsedTime * 0.4) * 0.03
						}
						target *= 1 - (SPEAKING_EXPRESSION_DAMPING[name] ?? 0) * speakingAmount
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
		}

		const animate = () => {
			timer.update()
			if (!isOnScreen || document.hidden) {
				frameIdRef.current = window.requestAnimationFrame(animate)
				return
			}

			tick(Math.min(timer.getDelta(), 0.1))
			frameIdRef.current = window.requestAnimationFrame(animate)
		}

		if (isDebugMode()) {
			// Chạy mô phỏng theo bước cố định, độc lập với tốc độ khung hình của trình duyệt (dùng khi gỡ lỗi chuyển động).
			window.__miraiStep = (frames, step = 1 / 60) => {
				for (let i = 0; i < frames; i += 1) {
					tick(step)
				}
			}
		}

		animate()
		void loadVrmFromUrl({ url: DEFAULT_VRM_PATH })

		return () => {
			loadVersionRef.current += 1
			resizeObserver.disconnect()
			window.removeEventListener('pointermove', handlePointerMove)
			document.removeEventListener('pointerleave', handlePointerLeave)
			scene.remove(lookTarget)
			dustMotes.dispose()
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
			timer.dispose()
			visibilityObserver.disconnect()
			canvas.removeEventListener('webglcontextlost', handleContextLost)
			canvas.removeEventListener('webglcontextrestored', handleContextRestored)
			renderer.dispose()
		}
		// Cảnh dựng một lần theo canvas; các hàm trong hook chỉ dùng ref và setter nên không cần là dependency.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	useEffect(() => {
		return () => {
			if (emotionTimeoutRef.current) {
				window.clearTimeout(emotionTimeoutRef.current)
				emotionTimeoutRef.current = null
			}

			if (loaderHideTimeoutRef.current) {
				window.clearTimeout(loaderHideTimeoutRef.current)
				loaderHideTimeoutRef.current = null
			}
		}
	}, [])

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

	// Cho avatar biết đang chờ phản hồi để làm tư thế "nghĩ".
	const setThinking = useCallback((isThinking) => {
		isThinkingRef.current = isThinking
	}, [])

	const reactToUserMessage = (text) => {
		// Đang chạy clip Welcome (tay đã giơ sẵn) thì không chồng thêm cử chỉ vẫy.
		if (GREETING_PATTERN.test(text) && currentAnimationNameRef.current !== 'Welcome') {
			gesturePlayer.play('wave', GESTURE_INTENSITY)
		}
	}

	const reactToReply = (replyEmotion) => {
		nodStartRef.current = performance.now()
		// Backend quyết định cảm xúc; null nghĩa là không có tín hiệu rõ nên giữ nguyên nét mặt.
		const emotion = ALL_EMOTIONS.includes(replyEmotion) ? replyEmotion : null
		if (!emotion) {
			return
		}

		if (emotion !== 'neutral') {
			gesturePlayer.play(emotion, GESTURE_INTENSITY)
		}
		setAnimationExpression(emotion)
		if (emotionTimeoutRef.current) {
			window.clearTimeout(emotionTimeoutRef.current)
		}
		emotionTimeoutRef.current = window.setTimeout(() => {
			setAnimationExpression('')
			emotionTimeoutRef.current = null
		}, EMOTION_HOLD_MS)
	}

	return {
		vrmLoadingProgress,
		vrmLoadingError,
		shouldShowVrmLoader,
		webglFailed,
		availableBlendShapes,
		blendShapeValues,
		handleBlendShapeChange,
		handleResetBlendShapes,
		retryVrmLoad,
		importVrmFile,
		setThinking,
		reactToUserMessage,
		reactToReply,
	}
}
