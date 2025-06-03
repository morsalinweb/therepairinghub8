// Update the manual trigger to emit events for real-time updates
import { NextResponse } from "next/server"
import connectToDatabase from "../../../../../lib/db"
import Job from "../../../../../models/Job"
import Transaction from "../../../../../models/Transaction"
import User from "../../../../../models/User"
import Notification from "../../../../../models/Notification"
import { emitEvent } from "../../../../../lib/websocket-utils"

export async function POST(req) {
  try {
    await connectToDatabase()

    const { jobId } = await req.json()

    if (!jobId) {
      return NextResponse.json({ success: false, message: "Job ID is required" }, { status: 400 })
    }

    console.log(`Manual trigger received for job: ${jobId}`)

    // Get the job
    const job = await Job.findById(jobId)
    if (!job) {
      return NextResponse.json({ success: false, message: "Job not found" }, { status: 404 })
    }

    // Check if job is in progress and payment is in escrow
    if (job.status !== "in_progress" || job.paymentStatus !== "in_escrow") {
      return NextResponse.json(
        {
          success: false,
          message: "Job is not in progress or payment is not in escrow",
          status: job.status,
          paymentStatus: job.paymentStatus,
        },
        { status: 400 },
      )
    }

    // Get transaction
    const transaction = await Transaction.findById(job.transactionId)
    if (!transaction) {
      return NextResponse.json({ success: false, message: "Transaction not found" }, { status: 404 })
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
        totalEarnings: providerAmount,
        availableBalance: providerAmount,
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

    console.log(`Job ${jobId} completed and payment released manually`)

    // Emit events for real-time updates
    emitEvent("job_updated", {
      jobId: job._id.toString(),
      action: "updated",
      job: job.toObject(),
    })

    emitEvent("payment_updated", {
      transactionId: transaction._id.toString(),
      jobId: job._id.toString(),
      status: "released",
    })

    emitEvent("escrow_released", {
      providerId: job.hiredProvider.toString(),
      amount: providerAmount,
      jobId: job._id.toString(),
    })

    emitEvent("transaction_updated", {
      userId: transaction.customer.toString(),
      transactionId: transaction._id.toString(),
    })

    return NextResponse.json({
      success: true,
      message: "Payment released successfully",
      job: job,
    })
  } catch (error) {
    console.error("Manual trigger error:", error)
    return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  }
}
