import { GESTURES } from './gestures'

export const clamp01 = (value) => Math.min(1, Math.max(0, value))

// Bật khi chạy dev server hoặc thêm ?debug vào URL: hiện panel blend shape và các hook gỡ lỗi trên window.
export const isDebugMode = () => import.meta.env.DEV || new URLSearchParams(window.location.search).has('debug')

export const DEFAULT_VRM_PATH = `${import.meta.env.BASE_URL}Mirai_Assets/Mirai_Model_casual.vrm`
export const DEFAULT_IMG_BACKGROUND = `${import.meta.env.BASE_URL}Mirai_Assets/room.png`
export const LOADING_LOGO_SRC = `${import.meta.env.BASE_URL}Mirai_Assets/LoadingLogo.png`

export const LIP_SHAPE_ALIASES = {
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

export const AnimationURLs = {
	Welcome: `${import.meta.env.BASE_URL}Mirai_Assets/Animation/VRMA_02.vrma`,
	Idle: `${import.meta.env.BASE_URL}Mirai_Assets/Animation/Idle.fbx`,
}

export const AnimationWithExpression = {
	Welcome: ['happy', AnimationURLs.Welcome],
	Idle: ['', AnimationURLs.Idle],
}

export const EMOTION_EXPRESSIONS = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']
// Cảm xúc ghép: VRM không có preset riêng nên trộn nhẹ từ preset sẵn có, phần còn lại do cử chỉ cơ thể (gestures.js) diễn tả.
export const EMOTION_MIX = {
	shy: { relaxed: 0.3, happy: 0.1 },
	thinking: { relaxed: 0.1, surprised: 0.05 },
}
export const ALL_EMOTIONS = [...EMOTION_EXPRESSIONS, ...Object.keys(EMOTION_MIX)]

export const EMOTION_HOLD_MS = 5000
export const LIP_SYNC_GAIN = 0.6 // thu nhỏ độ mở miệng của khẩu hình: giá trị từ backend làm miệng mở quá rộng
// Phần nét mặt bị giảm đi khi Mirai đang nói (0 = giữ nguyên, 1 = tắt hẳn).
export const SPEAKING_EXPRESSION_DAMPING = { happy: 0.8, surprised: 0.75, angry: 0.5, sad: 0.4, relaxed: 0.5 }
export const GESTURE_BONES = [...new Set(Object.values(GESTURES).flatMap((gesture) => gesture.tracks.map((t) => t.bone)))]
export const GREETING_PATTERN = /^\s*(xin\s+chào|chào|hello|hi|hey)(?=$|[\s,!.?~])/i
export const GESTURE_INTENSITY = 1.25
export const REST_ARM_DROP = 1.2 // rad: hạ cánh tay từ T-pose xuống dáng đứng tự nhiên
export const REST_ELBOW_BEND = 0.2
export const ANIMATION_FADE_SECONDS = 0.5 // crossfade giữa các clip, tránh nhảy tư thế đột ngột
export const EXPRESSION_EASE = 5 // tốc độ làm mượt nét mặt (1/giây)
export const IDLE_SMILE = 0.14 // nét cười rất nhẹ khi không có cảm xúc nào đang giữ: mặt trung tính hoàn toàn trông vô hồn
