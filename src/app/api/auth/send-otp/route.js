import { NextResponse } from "next/server"
import  connectToDatabase  from "../../../../lib/db"
import { generateOTP, sendEmail } from "../../../../lib/email"

export const dynamic = "force-dynamic"

export async function POST(request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json({ success: false, message: "Email is required" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Generate a 6-digit OTP
    const otp = generateOTP()

    // Store OTP in database or cache with expiration (10 minutes)
    // For demo purposes, we'll use a simple in-memory store
    // In production, use Redis or database
    global.otpStore = global.otpStore || {}
    global.otpStore[email] = {
      otp,
      expires: Date.now() + 10 * 60 * 1000, // 10 minutes
    }

    // Send OTP email
    // In a real app, this would use a proper email service
    console.log(`OTP for ${email}: ${otp}`) // For testing purposes

    // For demo, we'll simulate email sending
    // In production, use a real email service
    const emailSent = await sendEmail(
      email,
      "Your Verification Code",
      `Your verification code is: ${otp}. It will expire in 10 minutes.`,
    )

    return NextResponse.json({ success: true, message: "OTP sent successfully" })
  } catch (error) {
    console.error("Send OTP error:", error)
    return NextResponse.json({ success: false, message: "Failed to send verification code" }, { status: 500 })
  }
}
