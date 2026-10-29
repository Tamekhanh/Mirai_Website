import * as THREE from 'three'

// Lighting follows the room backdrop: warm afternoon sun through the window on the right,
// wood-floor bounce from below, and a faint cool sky fill on the shadow side. Neutral white
// light against a warm room is what made the face look pale and pasted-on.
export const addRoomLighting = (scene) => {
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
}

// Soft floating dust motes for depth.
export const createDustMotes = (scene) => {
	const count = 60
	const positions = new Float32Array(count * 3)
	const speeds = new Float32Array(count)
	for (let i = 0; i < count; i += 1) {
		positions[i * 3] = (Math.random() - 0.5) * 2.4
		positions[i * 3 + 1] = 0.8 + Math.random() * 1.6
		positions[i * 3 + 2] = -0.8 + Math.random() * 1.6
		speeds[i] = 0.015 + Math.random() * 0.03
	}

	const geometry = new THREE.BufferGeometry()
	geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
	const material = new THREE.PointsMaterial({
		color: 0xffffff,
		size: 0.012,
		transparent: true,
		opacity: 0.45,
		depthWrite: false,
		sizeAttenuation: true,
	})
	scene.add(new THREE.Points(geometry, material))

	return {
		update(delta) {
			const attribute = geometry.attributes.position
			for (let i = 0; i < count; i += 1) {
				let y = attribute.getY(i) + speeds[i] * delta
				if (y > 2.4) {
					y = 0.8
				}
				attribute.setY(i, y)
			}
			attribute.needsUpdate = true
		},
		dispose() {
			geometry.dispose()
			material.dispose()
		},
	}
}
