import { useState } from 'react'

function BlendShapeDebugPanel({ availableBlendShapes, blendShapeValues, onChange, onReset }) {
	const [isOpen, setIsOpen] = useState(false)

	return (
		<div className='blendshape-debug'>
			<div className='blendshape-debug-header'>
				<button
					type='button'
					className='blendshape-debug-toggle'
					onClick={() => setIsOpen((prev) => !prev)}
				>
					{isOpen ? 'Hide Blend Shape Debug' : 'Show Blend Shape Debug'}
				</button>
				{isOpen && (
					<button type='button' className='blendshape-debug-reset' onClick={onReset}>
						Reset
					</button>
				)}
			</div>
			{isOpen && (
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
								onChange={(event) => onChange(name, Number(event.target.value))}
							/>
							<span>{(blendShapeValues[name] ?? 0).toFixed(2)}</span>
						</label>
					))}
				</div>
			)}
		</div>
	)
}

export default BlendShapeDebugPanel
