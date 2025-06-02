import { NextResponse } from "next/server"
import { headers } from "next/headers"
import Stripe from "stripe"
import connectToDatabase from "../../../../lib/db"
import Transaction from "../../../../models/Transaction"
import Job from "../../../../models/Job"
import User from "../../../../models/User"
import Notification from "../../../../models/Notification"

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(req) {
  try {
    await connectToDatabase()

    const body = await req.text()
    const headersList = headers()
    const signature = headersList.get("stripe-signature")

    let event

    try {
      event = stripe.webhooks.constructEvent(body, signature, endpointSecret)
    } catch (err) {
      console.error(`Webhook signature verification failed: ${err.message}`)
      return NextResponse.json({ success: false, message: `Webhook Error: ${err.message}` }, { status: 400 })
    }

    // Handle the event
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutSessionCompleted(event.data.object)
        break
      case "payment_intent.succeeded":
        await handlePaymentIntentSucceeded(event.data.object)
        break
      case "payment_intent.payment_failed":
        await handlePaymentIntentFailed(event.data.object)
        break
      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error("Stripe webhook error:", error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}

// Handle checkout session completed
async function handleCheckoutSessionCompleted(session) {
  try {
    // Find transaction by session ID
    const transaction = await Transaction.findOne({ paymentId: session.id })
    if (!transaction) {
      console.error("Transaction not found for session:", session.id)
      return
    }

    // Update transaction status
    transaction.status = "in_escrow"
    await transaction.save()

    // Get the job
    const job = await Job.findById(transaction.job)
    if (!job) {
      console.error("Job not found for transaction:", transaction._id)
      return
    }

    // Set escrow end date (default 1 minute from now)
    const escrowPeriodMinutes = Number.parseInt(process.env.ESCROW_PERIOD_MINUTES || "1", 10)
    const escrowEndDate = new Date(Date.now() + escrowPeriodMinutes * 60 * 1000)

    // Update job status
    job.status = "in_progress"
    job.paymentStatus = "in_escrow"
    job.escrowEndDate = escrowEndDate
    job.transactionId = transaction._id
    await job.save()

    // Update buyer's spending
    await User.findByIdAndUpdate(transaction.customer, {
      $inc: { totalSpending: transaction.amount },
    })

    // Create notification for job poster
    const notification = await Notification.create({
      recipient: transaction.customer,
      type: "payment",
      message: `Payment successful for job: ${job.title}. Provider has been hired.`,
      relatedId: transaction._id,
      onModel: "Transaction",
    })

    // Create notification for provider
    const providerNotification = await Notification.create({
      recipient: job.hiredProvider,
      type: "job_assigned",
      message: `You have been hired for the job: ${job.title}. Payment has been received.`,
      relatedId: job._id,
      onModel: "Job",
    })

    console.log("Checkout session completed for transaction:", transaction._id)

    // Schedule job completion after escrow period
    scheduleJobCompletion(job._id, escrowEndDate)
  } catch (error) {
    console.error("Error handling checkout session completed:", error)
  }
}

// Handle payment intent succeeded
async function handlePaymentIntentSucceeded(paymentIntent) {
  try {
    // Find transaction
    const transaction = await Transaction.findOne({ paymentId: paymentIntent.id })
    if (!transaction) {
      console.error("Transaction not found for payment intent:", paymentIntent.id)
      return
    }

    // Update transaction status
    transaction.status = "in_escrow"
    await transaction.save()

    // Get the job
    const job = await Job.findById(transaction.job)
    if (!job) {
      console.error("Job not found for transaction:", transaction._id)
      return
    }

    // Set escrow end date (default 1 minute from now)
    const escrowPeriodMinutes = Number.parseInt(process.env.ESCROW_PERIOD_MINUTES || "1", 10)
    const escrowEndDate = new Date(Date.now() + escrowPeriodMinutes * 60 * 1000)

    // Update job status
    job.status = "in_progress"
    job.paymentStatus = "in_escrow"
    job.escrowEndDate = escrowEndDate
    job.transactionId = transaction._id
    await job.save()

    // Update buyer's spending
    await User.findByIdAndUpdate(transaction.customer, {
      $inc: { totalSpending: transaction.amount },
    })

    // Create notification for job poster
    const notification = await Notification.create({
      recipient: transaction.customer,
      type: "payment",
      message: `Payment successful for job: ${job.title}. Funds are now in escrow.`,
      relatedId: transaction._id,
      onModel: "Transaction",
    })

    console.log("Payment successful for transaction:", transaction._id)

    // Schedule job completion after escrow period
    scheduleJobCompletion(job._id, escrowEndDate)
  } catch (error) {
    console.error("Error handling successful payment:", error)
  }
}

// Handle failed payment
async function handlePaymentIntentFailed(paymentIntent) {
  try {
    // Find transaction
    const transaction = await Transaction.findOne({ paymentId: paymentIntent.id })
    if (!transaction) {
      console.error("Transaction not found for payment intent:", paymentIntent.id)
      return
    }

    // Update transaction status
    transaction.status = "failed"
    await transaction.save()

    // Get job
    const job = await Job.findById(transaction.job)
    if (!job) {
      console.error("Job not found for transaction:", transaction._id)
      return
    }

    // Reset job status if payment failed
    job.status = "active"
    job.hiredProvider = null
    job.paymentStatus = "pending"
    await job.save()

    // Create notification for job poster
    const notification = await Notification.create({
      recipient: transaction.customer,
      type: "payment",
      message: `Payment failed for job: ${job.title}. Please try again.`,
      relatedId: transaction._id,
      onModel: "Transaction",
    })

    console.log("Payment failed for transaction:", transaction._id)
  } catch (error) {
    console.error("Error handling failed payment:", error)
  }
}

// Schedule job completion after escrow period
async function scheduleJobCompletion(jobId, escrowEndDate) {
  const timeUntilCompletion = new Date(escrowEndDate).getTime() - Date.now()

  if (timeUntilCompletion <= 0) {
    // If escrow period has already passed, complete job immediately
    await completeJob(jobId)
    return
  }

  // Schedule job completion
  setTimeout(async () => {
    await completeJob(jobId)
  }, timeUntilCompletion)

  console.log(`Job ${jobId} scheduled for completion in ${timeUntilCompletion}ms`)
}

// Complete job and release payment
async function completeJob(jobId) {
  try {
    const job = await Job.findById(jobId)

    if (!job) {
      console.error("Job not found for completion:", jobId)
      return
    }

    // Only complete jobs that are still in escrow
    if (job.status === "in_progress" && job.paymentStatus === "in_escrow") {
      // Get transaction
      const transaction = await Transaction.findById(job.transactionId)
      if (!transaction) {
        console.error("Transaction not found for job:", jobId)
        return
      }

      // Update transaction
      transaction.provider = job.hiredProvider
      transaction.status = "released"
      await transaction.save()

      // Update job
      job.status = "completed"
      job.paymentStatus = "released"
      job.completedAt = new Date()
      await job.save()

      // Calculate provider amount (minus service fee)
      const providerAmount = transaction.amount - (transaction.serviceFee || 0)

      // Update provider's available balance and total earnings
      await User.findByIdAndUpdate(job.hiredProvider, {
        $inc: {
          balance: providerAmount,
          availableBalance: providerAmount,
          totalEarnings: providerAmount,
        },
      })

      // Create notifications
      const buyerNotification = await Notification.create({
        recipient: transaction.customer,
        type: "job_completed",
        message: `Your job "${job.title}" has been completed and payment has been released to the provider.`,
        relatedId: job._id,
        onModel: "Job",
      })

      const providerNotification = await Notification.create({
        recipient: job.hiredProvider,
        type: "payment",
        message: `Payment for job "${job.title}" has been released to your account. Your available balance has been updated.`,
        relatedId: transaction._id,
        onModel: "Transaction",
      })

      console.log(`Job ${jobId} completed and payment released automatically`)
    }
  } catch (error) {
    console.error("Error completing job:", error)
  }
}
