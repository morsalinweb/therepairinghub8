"use client"

import { useEffect, useRef, useCallback, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { messageAPI } from "@/lib/api"

// Event emitter for real-time updates
class EventEmitter {
  constructor() {
    this.events = {}
  }

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(callback)

    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter((cb) => cb !== callback)
    }
  }

  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach((callback) => {
        try {
          callback(data)
        } catch (error) {
          console.error("Error in event callback:", error)
        }
      })
    }
  }
}

export const eventEmitter = new EventEmitter()

// WebSocket connection manager
class WebSocketManager {
  constructor() {
    this.ws = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectDelay = 1000
    this.isConnecting = false
    this.messageQueue = []
    this.subscriptions = new Set()
  }

  connect(userId) {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.isConnecting = true
    const wsUrl =
      process.env.NODE_ENV === "production"
        ? `wss://${window.location.host}/ws`
        : `ws://localhost:${process.env.PORT || 3000}/ws`

    console.log("🔌 Attempting WebSocket connection to:", wsUrl)

    try {
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log("✅ WebSocket connected")
        this.isConnecting = false
        this.reconnectAttempts = 0

        // Send authentication
        if (userId) {
          this.send({ type: "auth", userId })
        }

        // Send queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift()
          this.send(message)
        }

        // Re-subscribe to all subscriptions
        this.subscriptions.forEach((subscription) => {
          this.send(subscription)
        })

        eventEmitter.emit("websocket_connected")
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log("📨 WebSocket message received:", data)

          // Emit the event to all listeners
          eventEmitter.emit(data.type, data)

          // Handle specific message types
          switch (data.type) {
            case "job_updated":
              eventEmitter.emit("job_update", data)
              break
            case "new_message":
              eventEmitter.emit("new_message", data.message)
              break
            case "payment_updated":
              eventEmitter.emit("payment_update", data)
              break
            case "escrow_released":
              eventEmitter.emit("escrow_released", data)
              break
            case "transaction_updated":
              eventEmitter.emit("transaction_update", data)
              break
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error)
        }
      }

      this.ws.onclose = (event) => {
        console.log("🔌 WebSocket disconnected:", event.code, event.reason)
        this.isConnecting = false
        this.ws = null

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++
          const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
          console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
          setTimeout(() => this.connect(userId), delay)
        } else {
          console.error("❌ Max reconnection attempts reached")
          eventEmitter.emit("websocket_disconnected")
        }
      }

      this.ws.onerror = (error) => {
        console.error("❌ WebSocket error:", error)
        this.isConnecting = false
      }
    } catch (error) {
      console.error("❌ Failed to create WebSocket connection:", error)
      this.isConnecting = false
    }
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      // Queue message for when connection is established
      this.messageQueue.push(message)
    }
  }

  subscribe(subscription) {
    this.subscriptions.add(subscription)
    this.send(subscription)
  }

  unsubscribe(subscription) {
    this.subscriptions.delete(subscription)
    this.send({ ...subscription, action: "unsubscribe" })
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.subscriptions.clear()
    this.messageQueue = []
    this.reconnectAttempts = 0
    this.isConnecting = false
  }
}

const wsManager = new WebSocketManager()

export const useRealTimeUpdates = () => {
  const { user } = useAuth()
  const [isConnected, setIsConnected] = useState(false)
  const messagePollingRef = useRef(null)
  const currentConversationRef = useRef(null)

  // Connect to WebSocket when user is available
  useEffect(() => {
    if (user?._id) {
      wsManager.connect(user._id)

      const handleConnected = () => setIsConnected(true)
      const handleDisconnected = () => setIsConnected(false)

      const unsubscribeConnected = eventEmitter.on("websocket_connected", handleConnected)
      const unsubscribeDisconnected = eventEmitter.on("websocket_disconnected", handleDisconnected)

      return () => {
        unsubscribeConnected()
        unsubscribeDisconnected()
      }
    }
  }, [user?._id])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (messagePollingRef.current) {
        clearInterval(messagePollingRef.current)
      }
    }
  }, [])

  const subscribeToJobUpdates = useCallback((jobId, callback) => {
    console.log("🔔 Subscribing to job updates for:", jobId)

    const subscription = { type: "subscribe_job", jobId }
    wsManager.subscribe(subscription)

    const unsubscribe = eventEmitter.on("job_update", callback)

    return () => {
      console.log("🔕 Unsubscribing from job updates for:", jobId)
      wsManager.unsubscribe(subscription)
      unsubscribe()
    }
  }, [])

  const subscribeToPaymentUpdates = useCallback((userId, callback) => {
    console.log("🔔 Subscribing to payment updates for user:", userId)

    const subscription = { type: "subscribe_payments", userId }
    wsManager.subscribe(subscription)

    const unsubscribePayment = eventEmitter.on("payment_update", callback)
    const unsubscribeEscrow = eventEmitter.on("escrow_released", callback)
    const unsubscribeTransaction = eventEmitter.on("transaction_update", callback)

    return () => {
      console.log("🔕 Unsubscribing from payment updates for user:", userId)
      wsManager.unsubscribe(subscription)
      unsubscribePayment()
      unsubscribeEscrow()
      unsubscribeTransaction()
    }
  }, [])

  const sendMessage = useCallback(async (jobId, recipientId, content) => {
    try {
      const { success, message } = await messageAPI.sendMessage({
        jobId,
        recipientId,
        content,
      })

      if (success) {
        // Emit the message via WebSocket for real-time updates
        wsManager.send({
          type: "new_message",
          message,
        })
        return true
      }
      return false
    } catch (error) {
      console.error("Error sending message:", error)
      return false
    }
  }, [])

  const startMessagePolling = useCallback((jobId, recipientId) => {
    // Stop any existing polling
    if (messagePollingRef.current) {
      clearInterval(messagePollingRef.current)
    }

    currentConversationRef.current = { jobId, recipientId }

    // Start polling every 5 seconds as backup to WebSocket
    messagePollingRef.current = setInterval(async () => {
      try {
        const { success, messages } = await messageAPI.getMessages(jobId, recipientId)
        if (success && messages && messages.length > 0) {
          // Emit the latest message if it's new
          const latestMessage = messages[messages.length - 1]
          eventEmitter.emit("new_message", latestMessage)
        }
      } catch (error) {
        console.error("Error polling messages:", error)
      }
    }, 5000)
  }, [])

  const stopMessagePolling = useCallback(() => {
    if (messagePollingRef.current) {
      clearInterval(messagePollingRef.current)
      messagePollingRef.current = null
    }
    currentConversationRef.current = null
  }, [])

  return {
    isConnected,
    subscribeToJobUpdates,
    subscribeToPaymentUpdates,
    sendMessage,
    startMessagePolling,
    stopMessagePolling,
  }
}

export default useRealTimeUpdates

