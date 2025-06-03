"use client"

import { Label } from "@/components/ui/label"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/hooks/use-toast"
import { Loader2, MapPin, Calendar, DollarSign, Clock, Upload, Send } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuth } from "@/contexts/auth-context"
import { jobAPI, quoteAPI, messageAPI, reviewAPI } from "@/lib/api"
import { useRealTimeUpdates, eventEmitter } from "@/lib/websocket-client"
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks"
import { setCurrentJob, updateJob } from "@/lib/redux/slices/jobSlice"
import { setQuotes, addQuote } from "@/lib/redux/slices/quoteSlice"
import { setMessages, addMessage, setCurrentConversation } from "@/lib/redux/slices/messageSlice"
import PaymentModal from "@/components/payment-modal"
import CountdownTimer from "@/components/countdown-timer"

export default function JobDetails({ params }) {
  const router = useRouter()
  const { toast } = useToast()
  const { user, isAuthenticated, loading: authLoading } = useAuth()
  const dispatch = useAppDispatch()

  // Redux state
  const job = useAppSelector((state) => state.jobs.currentJob)
  const quotes = useAppSelector((state) => state.quotes.quotes)
  const messages = useAppSelector((state) => state.messages.messages)
  const jobLoading = useAppSelector((state) => state.jobs.loading)

  // Local state
  const [isLoading, setIsLoading] = useState(true)
  const [newQuote, setNewQuote] = useState("")
  const [quotePrice, setQuotePrice] = useState("")
  const [quoteImage, setQuoteImage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showHireModal, setShowHireModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [newMessage, setNewMessage] = useState("")
  const [messageRecipient, setMessageRecipient] = useState(null)
  const [activeTab, setActiveTab] = useState("quotes")
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const { startMessagePolling, stopMessagePolling, subscribeToJobUpdates, sendMessage } = useRealTimeUpdates()

  // Review modal state
  const [showReviewModal, setShowReviewModal] = useState(false)
  const [reviewData, setReviewData] = useState({ rating: 5, comment: "" })
  const [isSubmittingReview, setIsSubmittingReview] = useState(false)

  useEffect(() => {
    // Wait for authentication to complete
    if (authLoading) return

    if (!isAuthenticated) {
      // If not authenticated, redirect to login
      router.push("/login?redirect=" + encodeURIComponent(`/jobs/${params.id}`))
      return
    }

    fetchJobDetails()

    // Cleanup function
    return () => {
      // Reset current job when leaving the page
      dispatch(setCurrentJob(null))
      dispatch(setQuotes([]))
      stopMessagePolling()
    }
  }, [params.id, isAuthenticated, authLoading, dispatch, router, stopMessagePolling])

  // Subscribe to real-time job updates
  useEffect(() => {
    if (job?._id) {
      console.log("Subscribing to job updates for:", job._id)
      const unsubscribe = subscribeToJobUpdates(job._id, (data) => {
        console.log("Job update received in component:", data)
        if (data.action === "updated") {
          // Force refresh job details to ensure we have the latest data
          fetchJobDetails()
          dispatch(updateJob(data.job))

          // Show toast notification for important updates
          if (data.job.status !== job.status) {
            toast({
              title: "Job Status Updated",
              description: `Job status changed to ${data.job.status}`,
            })
          }
        } else if (data.action === "hired" && data.providerId === user?._id) {
          toast({
            title: "You've been hired!",
            description: `You have been hired for the job: ${data.job.title}`,
          })
          fetchJobDetails()
          dispatch(updateJob(data.job))
        } else if (data.action === "payment_updated") {
          toast({
            title: "Payment Status Updated",
            description: `Payment status changed to ${data.job.paymentStatus}`,
          })
          fetchJobDetails()
          dispatch(updateJob(data.job))
        }
      })

      return unsubscribe
    }
  }, [job?._id, user, subscribeToJobUpdates, toast, dispatch])

  // Listen for real-time messages
  useEffect(() => {
    const handleNewMessage = (message) => {
      // Check if this message belongs to the current conversation
      if (message.job === params.id) {
        if (
          (message.sender._id === user?._id && message.recipient._id === messageRecipient?._id) ||
          (message.sender._id === messageRecipient?._id && message.recipient._id === user?._id)
        ) {
          dispatch(addMessage(message))
        }
      }
    }

    // Subscribe to new message events
    const unsubscribe = eventEmitter.on("new_message", handleNewMessage)

    return () => {
      // Unsubscribe when component unmounts
      unsubscribe()
    }
  }, [dispatch, messageRecipient, params.id, user])

  // Start polling for messages when recipient changes
  useEffect(() => {
    if (messageRecipient && messageRecipient._id && params.id) {
      startMessagePolling(params.id, messageRecipient._id)
    }

    return () => {
      stopMessagePolling()
    }
  }, [messageRecipient, params.id, startMessagePolling, stopMessagePolling])

  // Scroll to bottom of messages without affecting page scroll
  useEffect(() => {
    if (messagesEndRef.current && messagesContainerRef.current) {
      // Only scroll the messages container, not the whole page
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    }
  }, [messages])

  // Auto-complete function when timer expires
  const handleTimerComplete = async () => {
    if (job?.status === "in_progress") {
      try {
        const { success, job: updatedJob } = await jobAPI.completeJob(job._id)
        if (success) {
          dispatch(updateJob(updatedJob))
          toast({
            title: "Job completed automatically",
            description: "The escrow period has ended and the job has been marked as completed.",
          })
        }
      } catch (error) {
        console.error("Auto-complete error:", error)
      }
    }
  }

  // Review submission function
  const handleSubmitReview = async () => {
    if (!reviewData.comment.trim()) {
      toast({
        title: "Review required",
        description: "Please provide a comment for your review.",
        variant: "destructive",
      })
      return
    }

    setIsSubmittingReview(true)

    try {
      const revieweeId = user?.userType === "Buyer" ? job.hiredProvider?._id : job.postedBy?._id

      const { success } = await reviewAPI.createReview({
        jobId: job._id,
        revieweeId,
        rating: reviewData.rating,
        comment: reviewData.comment,
      })

      if (success) {
        toast({
          title: "Review submitted",
          description: "Your review has been submitted successfully.",
        })
        setShowReviewModal(false)
        setReviewData({ rating: 5, comment: "" })
      }
    } catch (error) {
      console.error("Review submission error:", error)
      toast({
        title: "Review failed",
        description: error.response?.data?.message || "There was a problem submitting your review.",
        variant: "destructive",
      })
    } finally {
      setIsSubmittingReview(false)
    }
  }

  const fetchJobDetails = async () => {
    try {
      setIsLoading(true)
      const { success, job, quotes } = await jobAPI.getJob(params.id)

      if (success && job) {
        dispatch(setCurrentJob(job))
        dispatch(setQuotes(quotes || []))

        // Set message recipient based on user type with null checks
        if (user?.userType === "Buyer" && job.hiredProvider) {
          setMessageRecipient(job.hiredProvider)
          fetchMessages(job.hiredProvider._id)
        } else if (user?.userType === "Seller" && job.postedBy) {
          setMessageRecipient(job.postedBy)
          fetchMessages(job.postedBy._id)
        }
      }
    } catch (error) {
      console.error("Error fetching job:", error)
      toast({
        title: "Error",
        description: "Failed to load job details.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const fetchMessages = async (recipientId) => {
    if (!recipientId) return

    try {
      const { success, messages } = await messageAPI.getMessages(params.id, recipientId)
      if (success) {
        dispatch(setMessages(messages || []))
        dispatch(
          setCurrentConversation({
            jobId: params.id,
            recipientId,
          }),
        )
      }
    } catch (error) {
      console.error("Error fetching messages:", error)
    }
  }

  const handleQuoteSubmit = async (e) => {
    e.preventDefault()

    if (!newQuote || !quotePrice) {
      toast({
        title: "Missing information",
        description: "Please provide both a message and price for your quote.",
        variant: "destructive",
      })
      return
    }

    if (isNaN(Number.parseFloat(quotePrice)) || Number.parseFloat(quotePrice) <= 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price.",
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Make sure we're sending the correct field names
      const { success, quote } = await quoteAPI.submitQuote({
        jobId: job._id,
        price: Number.parseFloat(quotePrice),
        message: newQuote,
        image: quoteImage,
      })

      if (success) {
        dispatch(addQuote(quote))
        setNewQuote("")
        setQuotePrice("")
        setQuoteImage(null)

        toast({
          title: "Quote submitted",
          description: "Your quote has been submitted successfully.",
        })

        // Set message recipient to job poster
        if (job.postedBy && !messageRecipient) {
          setMessageRecipient(job.postedBy)
          fetchMessages(job.postedBy._id)
        }
      }
    } catch (error) {
      console.error("Error submitting quote:", error)
      toast({
        title: "Submission failed",
        description: error.response?.data?.message || "There was a problem submitting your quote.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleImageUpload = (e) => {
    const file = e.target.files[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setQuoteImage(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleHire = (provider) => {
    if (!provider || !provider.provider) {
      toast({
        title: "Error",
        description: "Invalid provider data. Please try again.",
        variant: "destructive",
      })
      return
    }

    setSelectedProvider(provider)
    setShowPaymentModal(true)
  }

  const confirmHire = async () => {
    if (!selectedProvider || !selectedProvider.provider || !selectedProvider.provider._id) {
      toast({
        title: "Error",
        description: "Invalid provider data. Please try again.",
        variant: "destructive",
      })
      return
    }

    try {
      const { success, job: updatedJob } = await jobAPI.hireProvider(job._id, selectedProvider.provider._id)

      if (success) {
        toast({
          title: "Provider hired!",
          description: `You have successfully hired ${selectedProvider.provider.name || "the provider"} for this job.`,
        })

        dispatch(updateJob(updatedJob))
        setShowHireModal(false)

        // Set message recipient to hired provider
        setMessageRecipient(selectedProvider.provider)
        fetchMessages(selectedProvider.provider._id)
      }
    } catch (error) {
      console.error("Error hiring provider:", error)
      toast({
        title: "Hiring failed",
        description: error.response?.data?.message || "There was a problem hiring this provider.",
        variant: "destructive",
      })
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !messageRecipient || !messageRecipient._id) return

    try {
      console.log("Sending message:", {
        jobId: job._id,
        receiverId: messageRecipient._id,
        content: newMessage,
      })

      // Use the new sendMessage function from useRealTimeUpdates
      const success = await sendMessage(job._id, messageRecipient._id, newMessage)

      if (success) {
        setNewMessage("")
      } else {
        toast({
          title: "Message failed",
          description: "There was a problem sending your message.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error sending message:", error)
      toast({
        title: "Message failed",
        description: error.response?.data?.message || "There was a problem sending your message.",
        variant: "destructive",
      })
    }
  }

  const handlePaymentSuccess = (updatedJob) => {
    dispatch(updateJob(updatedJob))
    setShowPaymentModal(false)

    // Set message recipient to hired provider
    if (updatedJob.hiredProvider) {
      setMessageRecipient(updatedJob.hiredProvider)
      fetchMessages(updatedJob.hiredProvider._id)
    }

    toast({
      title: "Provider hired!",
      description: `You have successfully hired a provider for this job.`,
    })
  }

  const handleTabChange = (value) => {
    setActiveTab(value)
  }

  const switchToMessagesTab = (provider) => {
    if (!provider) return

    setMessageRecipient(provider)
    if (provider._id) {
      fetchMessages(provider._id)
    }
    setActiveTab("messages")
  }

  const handleMarkComplete = async () => {
    // Check if timer has expired
    if (job?.escrowEndDate) {
      const now = new Date()
      const escrowEndDate = new Date(job.escrowEndDate)

      if (now < escrowEndDate) {
        const timeRemaining = Math.ceil((escrowEndDate - now) / 1000)
        toast({
          title: "Cannot complete yet",
          description: `Please wait ${timeRemaining} seconds before marking the job as completed`,
          variant: "destructive",
        })
        return
      }
    }

    if (confirm("Are you sure you want to mark this job as completed?")) {
      try {
        const { success, job: updatedJob } = await jobAPI.completeJob(job._id)
        if (success) {
          dispatch(updateJob(updatedJob))
          toast({
            title: "Job completed",
            description: "The job has been marked as completed successfully.",
          })
        }
      } catch (error) {
        console.error("Mark complete error:", error)
        toast({
          title: "Action failed",
          description: error.response?.data?.message || "There was a problem marking the job as completed.",
          variant: "destructive",
        })
      }
    }
  }

  if (isLoading || jobLoading || authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!job) {
    return (
      <div className="container py-10">
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <h3 className="text-xl font-medium mb-2">Job not found</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            The job you're looking for doesn't exist or has been removed.
          </p>
          <Button asChild>
            <Link href="/jobs">Browse Jobs</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-10">
      <div className="grid md:grid-cols-3 gap-6">
        {/* Job Details */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <Badge className="mb-2">{job.category}</Badge>
                  <CardTitle className="text-2xl mb-2">{job.title}</CardTitle>
                  <CardDescription className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 mr-1" />${job.price}
                    </div>
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {job.location}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-1" />
                      {new Date(job.date).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <Clock className="h-4 w-4 mr-1" />
                      {job.status === "active" ? "Open" : job.status === "in_progress" ? "In Progress" : "Completed"}
                    </div>
                  </CardDescription>
                </div>

                {user?.userType === "Buyer" &&
                  job.postedBy &&
                  job.postedBy._id === user?._id &&
                  job.status === "active" && (
                    <Button
                      variant="outline"
                      className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                      onClick={async () => {
                        if (confirm("Are you sure you want to cancel this job?")) {
                          try {
                            const { success, job: updatedJob } = await jobAPI.updateJob(job._id, {
                              status: "cancelled",
                            })
                            if (success) {
                              dispatch(updateJob(updatedJob))
                              toast({
                                title: "Job cancelled",
                                description: "The job has been cancelled successfully.",
                              })
                            }
                          } catch (error) {
                            console.error("Cancel job error:", error)
                            toast({
                              title: "Cancellation failed",
                              description: error.response?.data?.message || "There was a problem cancelling the job.",
                              variant: "destructive",
                            })
                          }
                        }
                      }}
                    >
                      Cancel Job
                    </Button>
                  )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Job Description</h3>
                  <p className="text-gray-600 dark:text-gray-300 mt-2">{job.description}</p>
                </div>

                <div>
                  <h3 className="text-lg font-semibold">Posted By</h3>
                  <Link href={`/users/${job?.postedBy?._id}`} className="block mt-2">
                    <div className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-lg transition-colors">
                      <Avatar className="h-10 w-10 mr-3">
                        <AvatarImage
                          src={job?.postedBy?.avatar || "/placeholder.svg?height=40&width=40"}
                          alt={job?.postedBy?.name || "User"}
                        />
                        <AvatarFallback>
                          {job?.postedBy?.name
                            ? job?.postedBy?.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                            : "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-blue-600 hover:text-blue-800">
                          {job?.postedBy?.name || job?.postedBy?.email || "User"}
                        </p>
                        <p className="text-sm text-gray-500">Job Poster • Click to view profile</p>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="mt-6">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="mb-4">
                <TabsTrigger value="quotes">Quotes ({quotes?.length || 0})</TabsTrigger>
                <TabsTrigger value="messages">Messages</TabsTrigger>
              </TabsList>

              <TabsContent value="quotes">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">Service Provider Quotes</CardTitle>
                    <CardDescription>Review quotes from service providers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {quotes && quotes.length > 0 ? (
                      <div className="space-y-6">
                        {quotes.map((quote) => (
                          <div key={quote._id} className="border rounded-lg p-4">
                            <div className="flex justify-between items-start mb-4">
                              <Link
                                href={`/users/${quote.provider?._id}`}
                                className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 p-2 rounded-lg transition-colors"
                              >
                                <Avatar className="h-10 w-10 mr-3">
                                  <AvatarImage
                                    src={quote.provider?.avatar || "/placeholder.svg?height=40&width=40"}
                                    alt={quote.provider?.name || "Provider"}
                                  />
                                  <AvatarFallback>
                                    {quote.provider?.name
                                      ? quote.provider.name
                                          .split(" ")
                                          .map((n) => n[0])
                                          .join("")
                                      : "P"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <p className="font-medium text-blue-600 hover:text-blue-800">
                                    {quote.provider?.name || quote.provider?.email || "Provider"}
                                  </p>
                                  <p className="text-sm text-gray-500">
                                    {new Date(quote.createdAt).toLocaleDateString()} • Click to view profile
                                  </p>
                                </div>
                              </Link>
                              <div className="text-xl font-bold text-green-600">${quote.price}</div>
                            </div>

                            <p className="text-gray-600 dark:text-gray-300 mb-4">{quote.message}</p>

                            {quote.image && (
                              <div className="mb-4">
                                <img
                                  src={quote.image || "/placeholder.svg?height=200&width=300"}
                                  alt="Quote attachment"
                                  className="rounded-md max-h-48 object-cover"
                                />
                              </div>
                            )}

                            {user?.userType === "Buyer" && job.status === "active" && (
                              <div className="flex gap-3 mt-4">
                                <Button onClick={() => handleHire(quote)}>Hire</Button>
                                <Button variant="outline" onClick={() => switchToMessagesTab(quote.provider)}>
                                  Message
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <p className="text-gray-500 dark:text-gray-400 mb-2">No quotes yet</p>
                        <p className="text-sm text-gray-400 dark:text-gray-500">
                          Be the first to send a quote for this job
                        </p>
                      </div>
                    )}

                    {user?.userType === "Seller" && job.status === "active" && (
                      <div className="mt-6 border-t pt-6">
                        <h3 className="text-lg font-semibold mb-4">Send a Quote</h3>
                        <form onSubmit={handleQuoteSubmit} className="space-y-4">
                          <div>
                            <Label htmlFor="quoteMessage">Message</Label>
                            <Textarea
                              id="quoteMessage"
                              placeholder="Describe your experience and how you can help with this job..."
                              value={newQuote}
                              onChange={(e) => setNewQuote(e.target.value)}
                              rows={4}
                              required
                            />
                          </div>

                          <div>
                            <Label htmlFor="quotePrice">Your Price ($)</Label>
                            <Input
                              id="quotePrice"
                              type="number"
                              placeholder="Enter your price"
                              value={quotePrice}
                              onChange={(e) => setQuotePrice(e.target.value)}
                              min="1"
                              step="0.01"
                              required
                            />
                          </div>

                          <div>
                            <Label htmlFor="quoteImage">Attach Image (Optional)</Label>
                            <div className="flex items-center gap-2 mt-1">
                              <Input
                                id="quoteImage"
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleImageUpload}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => document.getElementById("quoteImage").click()}
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Upload Image
                              </Button>
                              {quoteImage && <span className="text-sm text-green-600">Image attached</span>}
                            </div>
                          </div>

                          <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              "Submit Quote"
                            )}
                          </Button>
                        </form>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="messages">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-xl">Messages</CardTitle>
                    <CardDescription>Communicate with the job poster or service providers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-96 flex flex-col">
                      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto mb-4 space-y-4">
                        {messages && messages.length > 0 ? (
                          messages.map((message) => (
                            <div
                              key={message._id}
                              className={`flex ${message.sender._id === user?._id ? "justify-end" : "justify-start"}`}
                            >
                              <div
                                className={`max-w-[80%] rounded-lg p-3 ${
                                  message.sender._id === user?._id
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-100 dark:bg-gray-800"
                                }`}
                              >
                                <div className="text-xs mb-1">
                                  {message.sender._id !== user?._id && (
                                    <span className="font-medium">
                                      {message.sender?.name || message.sender?.email || "User"}
                                    </span>
                                  )}
                                  <span className="text-gray-400 dark:text-gray-500 ml-2">
                                    {new Date(message.createdAt).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                </div>
                                <p>{message.message}</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <p className="text-gray-500 dark:text-gray-400">No messages yet</p>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>

                      {messageRecipient ? (
                        <div className="border-t pt-4">
                          <div className="flex gap-2">
                            <Textarea
                              placeholder="Type your message..."
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              className="min-h-[60px]"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && !e.shiftKey) {
                                  e.preventDefault()
                                  handleSendMessage()
                                }
                              }}
                            />
                            <Button onClick={handleSendMessage} className="h-auto">
                              <Send className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="border-t pt-4 text-center text-gray-500">
                          {job.status === "active" && user?.userType === "Seller" ? (
                            <p>Submit a quote to start messaging with the job poster</p>
                          ) : job.status === "active" && user?.userType === "Buyer" ? (
                            <p>Hire a provider to start messaging</p>
                          ) : (
                            <p>Messaging is not available for this job</p>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Sidebar */}
        <div className="md:col-span-1">
          <Card className="sticky top-20">
            <CardHeader>
              <CardTitle className="text-xl">Job Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
                <p className="font-semibold mt-1">
                  {job.status === "active"
                    ? "Open for Quotes"
                    : job.status === "in_progress"
                      ? "In Progress"
                      : job.status === "completed"
                        ? "Completed"
                        : "Cancelled"}
                </p>
              </div>

              {/* Timer Display */}
              {job.status === "in_progress" && job.escrowEndDate && (
                <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
                  <h3 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">Escrow Timer</h3>
                  <CountdownTimer endDate={job.escrowEndDate} onComplete={handleTimerComplete} />
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                    Job will auto-complete when timer reaches zero
                  </p>
                </div>
              )}

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Budget</h3>
                <p className="font-semibold mt-1">${job.price}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Location</h3>
                <p className="font-semibold mt-1">{job.location}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Date Posted</h3>
                <p className="font-semibold mt-1">{new Date(job.createdAt).toLocaleDateString()}</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Quotes Received</h3>
                <p className="font-semibold mt-1">{quotes?.length || 0}</p>
              </div>

              {job.status === "in_progress" && job.hiredProvider && (
                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Hired Provider</h3>
                  <div className="flex items-center">
                    <Avatar className="h-10 w-10 mr-3">
                      <AvatarImage
                        src={job?.hiredProvider?.avatar || "/placeholder.svg?height=40&width=40"}
                        alt={job?.hiredProvider?.name || "Provider"}
                      />
                      <AvatarFallback>
                        {job?.hiredProvider?.name
                          ? job?.hiredProvider.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                          : "P"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">
                        {job?.hiredProvider?.name || job?.hiredProvider?.email || "Provider"}
                      </p>
                      <p className="text-sm text-gray-500">
                        ${quotes?.find((q) => q.provider?._id === job.hiredProvider?._id)?.price || job.price}
                      </p>
                    </div>
                  </div>

                  {user?.userType === "Buyer" && user._id === job.postedBy?._id && (
                    <Button className="w-full mt-4" onClick={handleMarkComplete}>
                      Mark as Completed
                    </Button>
                  )}
                </div>
              )}

              {/* Add review button for completed jobs */}
              {job.status === "completed" &&
                ((user?.userType === "Buyer" && user._id === job.postedBy?._id) ||
                  (user?.userType === "Seller" && user._id === job.hiredProvider?._id)) && (
                  <div className="border-t pt-4 mt-4">
                    <Button className="w-full" onClick={() => setShowReviewModal(true)}>
                      Leave a Review
                    </Button>
                  </div>
                )}

              {user?.userType === "Buyer" && user._id === job.postedBy?._id && job.status === "active" && (
                <div className="border-t pt-4 mt-4">
                  <Button
                    variant="outline"
                    className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
                    onClick={async () => {
                      if (confirm("Are you sure you want to cancel this job?")) {
                        try {
                          const { success, job: updatedJob } = await jobAPI.updateJob(job._id, { status: "cancelled" })
                          if (success) {
                            dispatch(updateJob(updatedJob))
                            toast({
                              title: "Job cancelled",
                              description: "The job has been cancelled successfully.",
                            })
                          }
                        } catch (error) {
                          console.error("Cancel job error:", error)
                          toast({
                            title: "Cancellation failed",
                            description: error.response?.data?.message || "There was a problem cancelling the job.",
                            variant: "destructive",
                          })
                        }
                      }
                    }}
                  >
                    Cancel Job
                  </Button>
                </div>
              )}

              {user?.userType === "Seller" && job.status === "active" && (
                <div className="border-t pt-4 mt-4">
                  <Button
                    className="w-full"
                    onClick={() => {
                      setActiveTab("quotes")
                      setTimeout(() => {
                        const quoteMessageEl = document.getElementById("quoteMessage")
                        if (quoteMessageEl) quoteMessageEl.focus()
                      }, 100)
                    }}
                  >
                    Send a Quote
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedProvider && selectedProvider.provider && (
        <PaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          jobId={job._id}
          providerId={selectedProvider.provider._id}
          providerName={selectedProvider.provider?.name || selectedProvider.provider?.email || "Provider"}
          amount={selectedProvider.price}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Hire Confirmation Modal */}
      <AlertDialog open={showHireModal} onOpenChange={setShowHireModal}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Hiring</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to hire{" "}
              {selectedProvider?.provider?.name || selectedProvider?.provider?.email || "this provider"} for $
              {selectedProvider?.price}? The funds will be held in escrow until the job is completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmHire}>Confirm Hire</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review modal at the end of the component */}
      {showReviewModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 p-6 rounded-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Leave a Review</h3>

            <div className="space-y-4">
              <div>
                <Label>Rating</Label>
                <div className="flex space-x-1 mt-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewData((prev) => ({ ...prev, rating: star }))}
                      className={`text-2xl ${star <= reviewData.rating ? "text-yellow-400" : "text-gray-300"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label>Comment</Label>
                <Textarea
                  value={reviewData.comment}
                  onChange={(e) => setReviewData((prev) => ({ ...prev, comment: e.target.value }))}
                  placeholder="Share your experience..."
                  rows={4}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 mt-6">
              <Button variant="outline" onClick={() => setShowReviewModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmitReview} disabled={isSubmittingReview}>
                {isSubmittingReview ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Review"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
