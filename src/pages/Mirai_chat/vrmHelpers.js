// Hàm thuần thao tác trên VRM / blend shape: không phụ thuộc React.
export const DEFAULT_BLEND_SHAPE_PRESETS = [
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

export const getAvailableBlendShapes = (expressionManager) => {
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

export const stabilizeVrmMeshes = (vrm) => {
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
