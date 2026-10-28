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
		<div className="vrm-loading-overlay" role={isError ? 'alert' : 'status'}>
			<div className="vrm-loading-container">
				{isError ? (
					<div className="vrm-error-state">
						<svg className="error-icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
								<circle cx="12" cy="12" r="9" />
								<path d="M12 7.5v5.5M12 16.5v.5" />
							</svg>
						<div className="error-title">Không tải được mô hình Mirai</div>
						<div className="error-message">
							Không kết nối được máy chủ hoặc không tải được mô hình. Bạn kiểm tra mạng rồi thử lại nhé.
						</div>
						<button onClick={onRetry} className="retry-button">
							Thử lại
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
							<div className="loading-title">Đang tải Mirai…</div>
							<div className="progress-bar-container">
								<div className="progress-bar" role="progressbar" aria-label="Tiến độ tải mô hình" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
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
