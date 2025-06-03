// Update the websocket client to handle more event types
import { eventEmitter } from "./websocket-utils"

// Function to initialize WebSocket connection
export function initializeWebSocket(token) {
  if (!token) {
    console.error("No auth token provided for WebSocket connection")
    return null
  }

  // Check if we're in a browser environment
  if (typeof window === "undefined") {
    return null
  }

  try {
    // Create WebSocket connection
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`

    console.log("Initializing WebSocket connection to:", wsUrl)

    const socket = new WebSocket(wsUrl)

    // Connection opened
    socket.addEventListener("open", (event) => {
      console.log("WebSocket connection established")

      // Store socket in window for global access
      window.socket = socket

      // Emit connection event
      eventEmitter.emit("ws_connected")
    })

    // Listen for messages
    socket.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data)
        console.log("WebSocket message received:", data)

        // Handle different event types
        switch (data.type) {
          case "job_updated":
            eventEmitter.emit("job_updated", data.payload)
            break
          case "message":
            eventEmitter.emit("new_message", data.payload)
            break
          case "notification":
            eventEmitter.emit("notification", data.payload)
            break
          case "payment_updated":
            eventEmitter.emit("payment_updated", data.payload)
            break
          case "transaction_updated":
            eventEmitter.emit("transaction_updated", data.payload)
            break
          case "escrow_released":
            eventEmitter.emit("escrow_released", data.payload)
            break
          default:
            console.log("Unknown WebSocket message type:", data.type)
        }
      } catch (error) {
        console.error("Error parsing WebSocket message:", error)
      }
    })

    // Connection closed
    socket.addEventListener("close", (event) => {
      console.log("WebSocket connection closed:", event.code, event.reason)

      // Remove socket from window
      delete window.socket

      // Emit disconnection event
      eventEmitter.emit("ws_disconnected")

      // Attempt to reconnect after delay if closure wasn't intentional
      if (event.code !== 1000) {
        console.log("Attempting to reconnect in 5 seconds...")
        setTimeout(() => {
          initializeWebSocket(token)
        }, 5000)
      }
    })

    // Connection error
    socket.addEventListener("error", (error) => {
      console.error("WebSocket error:", error)

      // Emit error event
      eventEmitter.emit("ws_error", error)
    })

    return socket
  } catch (error) {
    console.error("Failed to initialize WebSocket:", error)
    return null
  }
}

// Function to send a message through WebSocket
export function sendWebSocketMessage(type, payload) {
  if (typeof window === "undefined" || !window.socket) {
    console.error("WebSocket not initialized")
    return false
  }

  try {
    const message = JSON.stringify({
      type,
      payload,
    })

    window.socket.send(message)
    return true
  } catch (error) {
    console.error("Error sending WebSocket message:", error)
    return false
  }
}

// Function to close WebSocket connection
export function closeWebSocket() {
  if (typeof window === "undefined" || !window.socket) {
    return
  }

  try {
    window.socket.close(1000, "User logged out")
    delete window.socket
  } catch (error) {
    console.error("Error closing WebSocket:", error)
  }
}
