import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('App error:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-fallback" role="alert">
        <AlertTriangle size={32} aria-hidden="true" />
        <h2>Something went wrong</h2>
        <p className="error-detail">{String(this.state.error?.message || this.state.error)}</p>
        <button type="button" className="primary" onClick={() => location.reload()}>
          Reload app
        </button>
      </div>
    )
  }
}
