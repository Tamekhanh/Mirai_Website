import * as THREE from 'three'
import { GESTURE_BONES, REST_ARM_DROP, REST_ELBOW_BEND } from './avatarConfig'

/**
 * Procedural body motion: small additive offsets on normalized bones, applied after the
 * animation mixer so it layers on top of any clip (or on the rest pose if none plays).
 * Each bone remembers what it applied last frame so the offset never accumulates when the
 * mixer has no track for that bone.
 */
export const createProceduralMotion = ({
	gesturePlayer,
	isThinkingRef,
	activeAudioRef,
	currentAnimationActionRef,
	nodStartRef,
}) => {
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
		bone.quaternion.multiply(offsetQuaternion).normalize()
		state.applied.copy(bone.quaternion)
		state.inverse.copy(offsetQuaternion).invert()
		state.active = true
	}

	const apply = (vrm, time, delta) => {
		const blend = 1 - Math.exp(-4 * delta)
		thinkingWeight += ((isThinkingRef.current ? 1 : 0) - thinkingWeight) * blend

		const audio = activeAudioRef.current
		const isSpeaking = Boolean(audio && !audio.paused && !audio.ended && !audio.muted)
		speakingWeight += ((isSpeaking ? 1 : 0) - speakingWeight) * blend

		// Không có clip nào đang chạy (tải lỗi / chưa tải xong): hạ tay xuống thay vì đứng dang tay kiểu T-pose.
		restPoseWeight += ((currentAnimationActionRef.current ? 0 : 1) - restPoseWeight) * blend

		const breath = Math.sin(time * 1.7)
		const nodAge = (performance.now() - nodStartRef.current) / 1000
		const nod = nodAge >= 0 && nodAge < 0.7 ? Math.sin((nodAge / 0.7) * Math.PI) ** 2 * 0.12 : 0
		const talkBob = speakingWeight * (Math.sin(time * 6.5) * 0.02 + Math.sin(time * 3.1) * 0.015)

		const headPitch = Math.sin(time * 0.43) * 0.015 + talkBob + nod - thinkingWeight * 0.04
		const headYaw = Math.sin(time * 0.5) * 0.04 + thinkingWeight * 0.15
		const headRoll = Math.sin(time * 0.37) * 0.02 + thinkingWeight * 0.1

		// Cộng dồn mọi offset (nền + cử chỉ) theo từng xương rồi áp một lần: applyBoneOffset gọi hai lần
		// trên cùng xương sẽ huỷ offset của lần đầu.
		const offsets = new Map()
		const addOffset = (boneName, x, y, z) => {
			const current = offsets.get(boneName) ?? [0, 0, 0]
			current[0] += x
			current[1] += y
			current[2] += z
			offsets.set(boneName, current)
		}

		addOffset('leftUpperArm', 0, 0, -REST_ARM_DROP * restPoseWeight)
		addOffset('rightUpperArm', 0, 0, REST_ARM_DROP * restPoseWeight)
		addOffset('leftLowerArm', 0, 0, -REST_ELBOW_BEND * restPoseWeight)
		addOffset('rightLowerArm', 0, 0, REST_ELBOW_BEND * restPoseWeight)
		addOffset('spine', breath * 0.006, 0, 0)
		addOffset('chest', breath * 0.012, Math.sin(time * 0.5) * 0.01, 0)
		addOffset('upperChest', breath * 0.008, 0, 0)
		addOffset('neck', headPitch * 0.4, headYaw * 0.4, headRoll * 0.4)
		addOffset('head', headPitch * 0.6, headYaw * 0.6, headRoll * 0.6)

		gesturePlayer.update(delta).forEach(([x, y, z], boneName) => addOffset(boneName, x, y, z))
		// Xương từng dùng bởi cử chỉ phải được áp mỗi khung (kể cả 0) để offset cũ được gỡ ra.
		GESTURE_BONES.forEach((boneName) => {
			if (!offsets.has(boneName)) {
				offsets.set(boneName, [0, 0, 0])
			}
		})
		offsets.forEach(([x, y, z], boneName) => applyBoneOffset(vrm, boneName, x, y, z))
	}

	return { apply, getSpeakingWeight: () => speakingWeight }
}
