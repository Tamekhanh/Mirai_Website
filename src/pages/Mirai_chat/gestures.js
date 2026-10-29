// Cử chỉ thủ công theo cảm xúc, chồng lên animation đang chạy dưới dạng offset góc xoay của xương humanoid.
//
// Để chuyển động mượt:
//  - mỗi kênh là một đường Hermite (tiếp tuyến lấy từ chênh lệch hữu hạn, hai đầu tiếp tuyến = 0) nên vị trí
//    và vận tốc liên tục, không có điểm gãy giữa các keyframe;
//  - mỗi cử chỉ có đường bao smootherstep ở đầu/cuối nên luôn bắt đầu và kết thúc ở 0;
//  - cử chỉ mới làm cử chỉ cũ mờ dần thay vì cắt ngang;
//  - kết quả đi qua lò xo giảm chấn tới hạn theo từng xương (đầu/cổ chậm hơn thân, tay chậm hơn vai)
//    để có độ trễ và quán tính giống chuyển động thật.
//
// Quy ước trục (xương normalized của VRM, nhân vật quay mặt về +Z, tay trái ở +X):
//  x dương: cúi/gập tới trước; y dương: quay về phía bên trái nhân vật; z dương: nhấc tay trái lên / nghiêng đầu sang phải.

const smootherstep = (t) => {
	const x = Math.min(Math.max(t, 0), 1)
	return x * x * x * (x * (x * 6 - 15) + 10)
}

// Nội suy Hermite qua các keyframe [thời gian, giá trị].
const sampleKeys = (keys, tangents, time) => {
	const last = keys.length - 1
	if (time <= keys[0][0]) {
		return keys[0][1]
	}
	if (time >= keys[last][0]) {
		return keys[last][1]
	}

	let i = 0
	while (i < last - 1 && time > keys[i + 1][0]) {
		i += 1
	}

	const t0 = keys[i][0]
	const v0 = keys[i][1]
	const span = keys[i + 1][0] - t0
	const v1 = keys[i + 1][1]
	const m0 = tangents[i] * span
	const m1 = tangents[i + 1] * span
	const u = (time - t0) / span
	const u2 = u * u
	const u3 = u2 * u
	return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * m1
}

// Tiếp tuyến tại mỗi keyframe (hai đầu = 0), tính một lần lúc khai báo.
const computeTangents = (keys) =>
	keys.map((_, index) => {
		if (index === 0 || index === keys.length - 1) {
			return 0
		}
		return (keys[index + 1][1] - keys[index - 1][1]) / (keys[index + 1][0] - keys[index - 1][0])
	})

// track: [bone, trục 0|1|2 = x|y|z, keyframes]
const AXIS = { x: 0, y: 1, z: 2 }
const track = (bone, axis, keys) => ({
	bone,
	axis: AXIS[axis],
	keys,
	tangents: computeTangents(keys),
	key: `${bone}:${AXIS[axis]}`,
})

// Cặp vai/tay đối xứng: truyền giá trị cho bên trái, bên phải lấy dấu ngược ở trục z/y.
const mirrored = (leftBone, rightBone, axis, keys) => {
	const flip = axis === 'z' || axis === 'y' ? -1 : 1
	return [
		track(leftBone, axis, keys),
		track(rightBone, axis, keys.map(([t, v]) => [t, v * flip])),
	]
}

export const GESTURES = {
	nod: {
		duration: 1,
		fadeIn: 0.12,
		fadeOut: 0.3,
		tracks: [
			track('head', 'x', [[0, 0], [0.3, 0.13], [0.62, -0.015], [1, 0]]),
			track('neck', 'x', [[0, 0], [0.32, 0.06], [0.66, -0.01], [1, 0]]),
		],
	},

	happy: {
		duration: 2.4,
		fadeIn: 0.25,
		fadeOut: 0.6,
		tracks: [
			track('head', 'z', [[0, 0], [0.5, 0.13], [1.3, 0.09], [2.4, 0]]),
			track('head', 'x', [[0, 0], [0.25, -0.05], [0.7, 0.04], [1.2, -0.02], [2.4, 0]]),
			track('chest', 'x', [[0, 0], [0.22, -0.035], [0.45, 0.025], [0.7, -0.02], [1, 0.01], [2.4, 0]]),
			track('spine', 'x', [[0, 0], [0.25, -0.02], [0.5, 0.015], [0.8, -0.01], [2.4, 0]]),
			...mirrored('leftShoulder', 'rightShoulder', 'z', [[0, 0], [0.35, 0.07], [1.5, 0.05], [2.4, 0]]),
			...mirrored('leftUpperArm', 'rightUpperArm', 'z', [[0, 0], [0.4, 0.14], [1.4, 0.1], [2.4, 0]]),
		],
	},

	sad: {
		duration: 3.6,
		fadeIn: 0.7,
		fadeOut: 1,
		tracks: [
			track('head', 'x', [[0, 0], [0.9, 0.2], [2.6, 0.17], [3.6, 0]]),
			track('neck', 'x', [[0, 0], [0.9, 0.08], [2.6, 0.07], [3.6, 0]]),
			track('head', 'y', [[0, 0], [1, 0.12], [2.6, 0.09], [3.6, 0]]),
			track('head', 'z', [[0, 0], [1, -0.07], [2.6, -0.05], [3.6, 0]]),
			track('chest', 'x', [[0, 0], [1, 0.07], [2.6, 0.06], [3.6, 0]]),
			track('spine', 'x', [[0, 0], [1, 0.03], [2.6, 0.025], [3.6, 0]]),
			...mirrored('leftShoulder', 'rightShoulder', 'z', [[0, 0], [0.9, -0.1], [2.6, -0.08], [3.6, 0]]),
			...mirrored('leftUpperArm', 'rightUpperArm', 'z', [[0, 0], [1, -0.07], [2.6, -0.05], [3.6, 0]]),
		],
	},

	angry: {
		duration: 2,
		fadeIn: 0.18,
		fadeOut: 0.6,
		tracks: [
			track('head', 'x', [[0, 0], [0.25, 0.12], [1.3, 0.1], [2, 0]]),
			track('head', 'y', [[0, 0], [0.25, 0.07], [0.55, -0.07], [0.85, 0.05], [1.15, -0.03], [1.45, 0], [2, 0]]),
			track('chest', 'x', [[0, 0], [0.25, -0.045], [1.3, -0.035], [2, 0]]),
			track('upperChest', 'x', [[0, 0], [0.25, -0.03], [1.3, -0.025], [2, 0]]),
			...mirrored('leftShoulder', 'rightShoulder', 'z', [[0, 0], [0.25, 0.1], [1.3, 0.08], [2, 0]]),
			...mirrored('leftUpperArm', 'rightUpperArm', 'z', [[0, 0], [0.3, 0.07], [1.3, 0.06], [2, 0]]),
		],
	},

	surprised: {
		duration: 1.8,
		fadeIn: 0.16,
		fadeOut: 0.7,
		tracks: [
			track('chest', 'x', [[0, 0], [0.12, -0.1], [0.5, -0.085], [1.1, -0.04], [1.8, 0]]),
			track('upperChest', 'x', [[0, 0], [0.12, -0.05], [0.5, -0.04], [1.8, 0]]),
			track('head', 'x', [[0, 0], [0.16, -0.11], [0.55, -0.095], [1.1, -0.04], [1.8, 0]]),
			track('neck', 'x', [[0, 0], [0.12, -0.06], [0.55, -0.05], [1.8, 0]]),
			...mirrored('leftShoulder', 'rightShoulder', 'z', [[0, 0], [0.12, 0.13], [0.6, 0.1], [1.8, 0]]),
			...mirrored('leftUpperArm', 'rightUpperArm', 'z', [[0, 0], [0.15, 0.2], [0.7, 0.15], [1.8, 0]]),
		],
	},

	relaxed: {
		duration: 4,
		fadeIn: 0.9,
		fadeOut: 1.2,
		tracks: [
			track('spine', 'z', [[0, 0], [1.2, 0.03], [2.8, -0.02], [4, 0]]),
			track('chest', 'x', [[0, 0], [1.3, -0.03], [2.6, 0.015], [4, 0]]),
			track('head', 'z', [[0, 0], [1.3, 0.09], [2.8, 0.06], [4, 0]]),
			track('head', 'x', [[0, 0], [1.4, -0.035], [4, 0]]),
			...mirrored('leftShoulder', 'rightShoulder', 'z', [[0, 0], [1.2, -0.05], [2.8, -0.04], [4, 0]]),
		],
	},

	// Ngại ngùng: cúi đầu, quay mặt tránh đi, co vai và khép tay vào người.
	shy: {
		duration: 3.2,
		fadeIn: 0.45,
		fadeOut: 0.9,
		tracks: [
			track('head', 'x', [[0, 0], [0.6, 0.15], [1.6, 0.12], [3.2, 0]]),
			track('neck', 'x', [[0, 0], [0.6, 0.06], [1.6, 0.05], [3.2, 0]]),
			track('head', 'y', [[0, 0], [0.7, -0.14], [1.7, -0.1], [3.2, 0]]),
			track('head', 'z', [[0, 0], [0.7, 0.1], [1.7, 0.07], [3.2, 0]]),
			track('chest', 'x', [[0, 0], [0.7, 0.045], [1.7, 0.035], [3.2, 0]]),
			...mirrored('leftShoulder', 'rightShoulder', 'z', [[0, 0], [0.5, 0.09], [1.7, 0.07], [3.2, 0]]),
			...mirrored('leftUpperArm', 'rightUpperArm', 'z', [[0, 0], [0.6, -0.06], [1.7, -0.05], [3.2, 0]]),
		],
	},

	// Suy nghĩ: nghiêng đầu, hơi quay sang một bên và ngước lên, gật nhẹ như đang cân nhắc.
	thinking: {
		duration: 3.6,
		fadeIn: 0.5,
		fadeOut: 0.9,
		tracks: [
			track('head', 'z', [[0, 0], [0.8, -0.12], [2.4, -0.1], [3.6, 0]]),
			track('head', 'y', [[0, 0], [0.8, 0.14], [2.4, 0.12], [3.6, 0]]),
			track('head', 'x', [[0, 0], [0.8, -0.07], [1.6, -0.03], [2.1, -0.07], [2.6, -0.04], [3.6, 0]]),
			track('neck', 'x', [[0, 0], [0.8, -0.03], [2.4, -0.03], [3.6, 0]]),
			track('chest', 'y', [[0, 0], [0.9, 0.04], [2.4, 0.035], [3.6, 0]]),
			track('spine', 'z', [[0, 0], [0.9, -0.02], [2.4, -0.018], [3.6, 0]]),
		],
	},

	// Vẫy tay chào bằng tay phải của nhân vật: giơ tay lên ngang đầu, cẳng tay đứng, vẫy qua lại.
	wave: {
		keep: true, // không bị cử chỉ cảm xúc đến sau làm hạ tay giữa chừng
		duration: 3.4,
		fadeIn: 0.5,
		fadeOut: 0.8,
		tracks: [
			track('rightUpperArm', 'z', [[0, 0], [0.7, -1.65], [2.6, -1.65], [3.4, 0]]),
			track('rightUpperArm', 'y', [[0, 0], [0.7, -0.25], [2.6, -0.25], [3.4, 0]]),
			track('rightLowerArm', 'z', [
				[0, 0], [0.7, -1.3],
				[1.0, -1.02], [1.3, -1.58], [1.6, -1.02], [1.9, -1.58], [2.2, -1.1], [2.6, -1.3],
				[3.4, 0],
			]),
			track('rightHand', 'z', [
				[0, 0], [0.7, 0],
				[1.1, 0.28], [1.4, -0.28], [1.7, 0.28], [2.0, -0.26], [2.3, 0.12], [2.6, 0],
				[3.4, 0],
			]),
			track('head', 'z', [[0, 0], [0.8, 0.1], [2.6, 0.08], [3.4, 0]]),
			track('chest', 'z', [[0, 0], [0.8, 0.025], [2.6, 0.02], [3.4, 0]]),
			track('rightShoulder', 'z', [[0, 0], [0.7, -0.06], [2.6, -0.05], [3.4, 0]]),
		],
	},
}

// Độ cứng lò xo (rad/s) theo xương: đầu/cổ phản ứng chậm hơn thân, bàn tay chậm hơn cánh tay (follow-through).
const SPRING_OMEGA = {
	spine: 12,
	chest: 11,
	upperChest: 10,
	neck: 9,
	head: 8,
	leftShoulder: 10,
	rightShoulder: 10,
	leftUpperArm: 9,
	rightUpperArm: 9,
	leftLowerArm: 8,
	rightLowerArm: 8,
	leftHand: 7,
	rightHand: 7,
}
const DEFAULT_OMEGA = 10
const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

export class GesturePlayer {
	constructor() {
		this.instances = []
		this.channels = new Map() // key `${bone}:${axis}` -> { bone, axis, pos, vel }
		this.targets = new Map()
		this.result = new Map() // bone -> [x, y, z], dùng lại mỗi khung để không sinh rác
		this.amplitude = 1
		this.freezeTime = null // chỉ dùng khi gỡ lỗi: giữ cử chỉ ở một thời điểm để xem tư thế
	}

	setAmplitude(amplitude) {
		this.amplitude = amplitude
	}

	play(name, intensity = 1) {
		const def = GESTURES[name]
		if (!def) {
			return
		}

		// Cùng một cử chỉ đang chạy: kéo nó lại giữa đoạn giữ tư thế thay vì hạ xuống rồi bắt đầu lại
		// (vd. chào hai lần liên tiếp thì tay vẫn giơ và tiếp tục vẫy).
		const running = this.instances.find((instance) => instance.name === name && !instance.released)
		if (running && running.time < def.duration - def.fadeOut) {
			running.time = Math.min(running.time, def.duration - def.fadeOut - 0.9)
			return
		}
		this.instances = this.instances.filter((instance) => instance.name !== name)

		// Cử chỉ cũ mờ đi cùng nhịp với lúc cử chỉ mới hiện lên, để hai tư thế hoà vào nhau thay vì rơi về 0 ở giữa.
		const releaseRate = clamp(3 / def.fadeIn, 2, 6)
		this.instances.forEach((instance) => {
			if (!instance.def.keep) {
				instance.released = true
				instance.releaseRate = releaseRate
			}
		})

		// Mỗi lần diễn hơi khác nhau (cường độ ±12%, tốc độ ±8%) để cùng một cảm xúc không lặp y hệt.
		this.instances.push({
			name,
			def,
			time: 0,
			speed: 0.92 + Math.random() * 0.16,
			intensity: intensity * (0.88 + Math.random() * 0.24),
			released: false,
			releaseRate: 0,
			hold: 1,
		})
	}

	get isActive() {
		return this.instances.length > 0
	}

	// Trả về Map<tên xương, [x, y, z]> đã làm mượt; xương vừa hết cử chỉ vẫn có mặt cho tới khi lò xo về 0.
	// Map và mảng trả về được dùng lại giữa các khung: đừng giữ tham chiếu sau lần gọi kế tiếp.
	update(delta) {
		const { targets, result } = this

		this.instances = this.instances.filter((instance) => {
			instance.time = this.freezeTime ?? instance.time + delta * instance.speed
			if (instance.released) {
				instance.hold *= Math.exp(-instance.releaseRate * delta)
			}
			return instance.time < instance.def.duration && instance.hold > 0.01
		})

		targets.clear()
		this.instances.forEach(({ def, time, intensity, hold }) => {
			const fadeIn = smootherstep(time / def.fadeIn)
			const fadeOut = smootherstep((def.duration - time) / def.fadeOut)
			const weight = fadeIn * fadeOut * hold * intensity * this.amplitude
			def.tracks.forEach((t) => {
				targets.set(t.key, (targets.get(t.key) ?? 0) + sampleKeys(t.keys, t.tangents, time) * weight)
				if (!this.channels.has(t.key)) {
					this.channels.set(t.key, { bone: t.bone, axis: t.axis, pos: 0, vel: 0 })
				}
			})
		})

		result.forEach((offsets) => offsets.fill(0))
		this.channels.forEach((state, key) => {
			const omega = SPRING_OMEGA[state.bone] ?? DEFAULT_OMEGA
			const hasTarget = targets.has(key)
			const target = hasTarget ? targets.get(key) : 0

			// Lò xo giảm chấn tới hạn (không vọt lố, không giật khi mục tiêu đổi).
			const decay = Math.exp(-omega * delta)
			const displacement = state.pos - target
			const temp = (state.vel + omega * displacement) * delta
			state.vel = (state.vel - omega * temp) * decay
			state.pos = target + (displacement + temp) * decay

			if (!hasTarget && Math.abs(state.pos) < 1e-4 && Math.abs(state.vel) < 1e-4) {
				this.channels.delete(key)
				return
			}

			let offsets = result.get(state.bone)
			if (!offsets) {
				offsets = [0, 0, 0]
				result.set(state.bone, offsets)
			}
			offsets[state.axis] += state.pos
		})

		return result
	}
}
