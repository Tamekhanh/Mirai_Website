import { useEffect, useState } from 'react'
import { getServerState, SERVER_STATE } from '../../services/chatApi'

const HEALTH_POLL_MS = 60000
const HEALTH_LOADING_POLL_MS = 10000

const STATUS_LABELS = {
	[SERVER_STATE.ONLINE]: 'Online',
	[SERVER_STATE.LOADING]: 'Starting',
	[SERVER_STATE.OFFLINE]: 'Offline',
}

export const STATUS_COLORS = { Online: '#22c55e', Starting: '#f59e0b', Offline: '#ef4444' }

/**
 * Poll the backend health and expose a label: 'Online' | 'Starting' | 'Offline'.
 * While the model is loading it re-checks sooner than the regular interval.
 */
export const useServerStatus = () => {
	const [status, setStatus] = useState(STATUS_LABELS[SERVER_STATE.OFFLINE])

	useEffect(() => {
		let retryTimer = null

		const checkStatus = async () => {
			clearTimeout(retryTimer)
			if (document.hidden) {
				return
			}

			const state = await getServerState()
			setStatus(STATUS_LABELS[state])
			if (state === SERVER_STATE.LOADING) {
				retryTimer = setTimeout(checkStatus, HEALTH_LOADING_POLL_MS)
			}
		}

		checkStatus()
		const statusInterval = setInterval(checkStatus, HEALTH_POLL_MS)
		document.addEventListener('visibilitychange', checkStatus)

		return () => {
			clearTimeout(retryTimer)
			clearInterval(statusInterval)
			document.removeEventListener('visibilitychange', checkStatus)
		}
	}, [])

	return status
}
