import * as THREE from 'three'

// Tên node sau khi FBXLoader bỏ dấu ':' ("mixamorig:Hips" -> "mixamorigHips") -> tên xương humanoid của VRM.
const MIXAMO_TO_VRM_BONE = {
	mixamorigHips: 'hips',
	mixamorigSpine: 'spine',
	mixamorigSpine1: 'chest',
	mixamorigSpine2: 'upperChest',
	mixamorigNeck: 'neck',
	mixamorigHead: 'head',
	mixamorigLeftShoulder: 'leftShoulder',
	mixamorigLeftArm: 'leftUpperArm',
	mixamorigLeftForeArm: 'leftLowerArm',
	mixamorigLeftHand: 'leftHand',
	mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
	mixamorigLeftHandThumb2: 'leftThumbProximal',
	mixamorigLeftHandThumb3: 'leftThumbDistal',
	mixamorigLeftHandIndex1: 'leftIndexProximal',
	mixamorigLeftHandIndex2: 'leftIndexIntermediate',
	mixamorigLeftHandIndex3: 'leftIndexDistal',
	mixamorigLeftHandMiddle1: 'leftMiddleProximal',
	mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
	mixamorigLeftHandMiddle3: 'leftMiddleDistal',
	mixamorigLeftHandRing1: 'leftRingProximal',
	mixamorigLeftHandRing2: 'leftRingIntermediate',
	mixamorigLeftHandRing3: 'leftRingDistal',
	mixamorigLeftHandPinky1: 'leftLittleProximal',
	mixamorigLeftHandPinky2: 'leftLittleIntermediate',
	mixamorigLeftHandPinky3: 'leftLittleDistal',
	mixamorigRightShoulder: 'rightShoulder',
	mixamorigRightArm: 'rightUpperArm',
	mixamorigRightForeArm: 'rightLowerArm',
	mixamorigRightHand: 'rightHand',
	mixamorigRightHandThumb1: 'rightThumbMetacarpal',
	mixamorigRightHandThumb2: 'rightThumbProximal',
	mixamorigRightHandThumb3: 'rightThumbDistal',
	mixamorigRightHandIndex1: 'rightIndexProximal',
	mixamorigRightHandIndex2: 'rightIndexIntermediate',
	mixamorigRightHandIndex3: 'rightIndexDistal',
	mixamorigRightHandMiddle1: 'rightMiddleProximal',
	mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
	mixamorigRightHandMiddle3: 'rightMiddleDistal',
	mixamorigRightHandRing1: 'rightRingProximal',
	mixamorigRightHandRing2: 'rightRingIntermediate',
	mixamorigRightHandRing3: 'rightRingDistal',
	mixamorigRightHandPinky1: 'rightLittleProximal',
	mixamorigRightHandPinky2: 'rightLittleIntermediate',
	mixamorigRightHandPinky3: 'rightLittleDistal',
	mixamorigLeftUpLeg: 'leftUpperLeg',
	mixamorigLeftLeg: 'leftLowerLeg',
	mixamorigLeftFoot: 'leftFoot',
	mixamorigLeftToeBase: 'leftToes',
	mixamorigRightUpLeg: 'rightUpperLeg',
	mixamorigRightLeg: 'rightLowerLeg',
	mixamorigRightFoot: 'rightFoot',
	mixamorigRightToeBase: 'rightToes',
}

/**
 * Retarget the clip of a Mixamo FBX onto a VRM's normalized humanoid.
 * Follows the three-vrm "loadMixamoAnimation" recipe: each rotation is re-expressed relative to
 * the Mixamo rest pose, and the hips translation is scaled to the VRM's hip height.
 * @param {THREE.Object3D} fbx - Object returned by FBXLoader (carries `animations`)
 * @param {import('@pixiv/three-vrm').VRM} vrm
 * @returns {THREE.AnimationClip}
 */
export const retargetMixamoClip = (fbx, vrm) => {
	const clip = fbx.animations?.find((animation) => animation.name === 'mixamo.com') ?? fbx.animations?.[0]
	if (!clip) {
		throw new Error('No animation clip found in FBX')
	}

	const hipsNode = fbx.getObjectByName('mixamorigHips')
	const vrmHips = vrm.humanoid?.getNormalizedBoneNode('hips')
	if (!hipsNode || !vrmHips) {
		throw new Error('FBX is not a Mixamo rig or VRM has no hips bone')
	}

	fbx.updateMatrixWorld(true)

	const restRotationInverse = new THREE.Quaternion()
	const parentRestWorldRotation = new THREE.Quaternion()
	const rotation = new THREE.Quaternion()

	const motionHipsHeight = hipsNode.position.y
	const vrmHipsHeight = Math.abs(
		vrmHips.getWorldPosition(new THREE.Vector3()).y - vrm.scene.getWorldPosition(new THREE.Vector3()).y
	)
	const hipsPositionScale = motionHipsHeight > 0 ? vrmHipsHeight / motionHipsHeight : 1
	const isVrm0 = vrm.meta?.metaVersion === '0'

	const tracks = []

	clip.tracks.forEach((track) => {
		const [rigName, property] = track.name.split('.')
		const vrmBoneName = MIXAMO_TO_VRM_BONE[rigName]
		const vrmNodeName = vrmBoneName ? vrm.humanoid.getNormalizedBoneNode(vrmBoneName)?.name : null
		const rigNode = fbx.getObjectByName(rigName)

		if (!vrmNodeName || !rigNode) {
			return
		}

		rigNode.getWorldQuaternion(restRotationInverse).invert()
		rigNode.parent.getWorldQuaternion(parentRestWorldRotation)

		if (track instanceof THREE.QuaternionKeyframeTrack) {
			const values = new Float32Array(track.values.length)
			for (let i = 0; i < track.values.length; i += 4) {
				rotation.fromArray(track.values, i)
				rotation.premultiply(parentRestWorldRotation).multiply(restRotationInverse)
				rotation.toArray(values, i)
			}

			// VRM 0.x quay mặt về -Z: đảo dấu x và z để khớp.
			if (isVrm0) {
				for (let i = 0; i < values.length; i += 4) {
					values[i] = -values[i]
					values[i + 2] = -values[i + 2]
				}
			}

			tracks.push(new THREE.QuaternionKeyframeTrack(`${vrmNodeName}.${property}`, track.times, values))
		} else if (track instanceof THREE.VectorKeyframeTrack) {
			const values = track.values.map((value, index) => {
				const flipped = isVrm0 && index % 3 !== 1 ? -value : value
				return flipped * hipsPositionScale
			})
			tracks.push(new THREE.VectorKeyframeTrack(`${vrmNodeName}.${property}`, track.times, values))
		}
	})

	if (tracks.length === 0) {
		throw new Error('FBX clip has no tracks that map to the VRM humanoid')
	}

	return new THREE.AnimationClip('mixamo_idle', clip.duration, tracks)
}
