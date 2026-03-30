import { useEffect, useState } from 'react'
import './VRMLoadingScreen.css'

function VRMLoadingScreen({ isLoading, progress, isError, onRetry, imageSrc }) {
	const [isVisible, setIsVisible] = useState(isLoading || isError)

	useEffect(() => {
		setIsVisible(isLoading || isError)
	}, [isLoading, isError])

	if (!isVisible) {
		return null
	}

	return (
		<div className="vrm-loading-overlay">
			<div className="vrm-loading-container">
				{isError ? (
					<div className="vrm-error-state">
						<div className="error-icon">❌</div>
						<div className="error-title">Failed to Load VRM Model</div>
						<div className="error-message">
							Could not connect to the server or load the model. Please check your connection and try again.
						</div>
						<button onClick={onRetry} className="retry-button">
							Retry
						</button>
					</div>
				) : (
					<div className="vrm-loading-state">
						{imageSrc && (
							<div className="loading-image-container">
								<img src={imageSrc} alt="Mirai" className="loading-image" />
							</div>
						)}
						<div className="loading-info">
							<div className="loading-title">Loading Mirai Model...</div>
							<div className="progress-bar-container">
								<div className="progress-bar">
									<div
										className="progress-fill"
										style={{
											width: `${Math.min(progress, 100)}%`,
											transition: 'width 0.3s ease-out',
										}}
									/>
								</div>
								<div className="progress-text">{Math.round(progress)}%</div>
							</div>
							<div className="loading-spinner" />
						</div>
					</div>
				)}
			</div>
		</div>
	)
}

export default VRMLoadingScreen
