"use client"
import { useState } from "react"
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
import { Loader2, CreditCard, ShoppingCartIcon as Paypal } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { jobAPI } from "@/lib/api"
import { useAuth } from "@/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"

export default function PaymentModal({ isOpen, onClose, jobId, providerId, providerName, amount, onSuccess }) {
  const { t } = useTranslation()
  const [paymentMethod, setPaymentMethod] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { toast } = useToast()
  const { user } = useAuth()

  const handlePayment = async () => {
    if (!paymentMethod) {
      toast({
        title: t("paymentModal.paymentMethodRequired"),
        description: t("paymentModal.selectPaymentMethodDescription"),
        variant: "destructive",
      })
      return
    }
    setIsSubmitting(true)
    const totalAmount = amount * 1.1 // Include the 10% service fee
    try {
      const response = await jobAPI.processPayment(jobId, providerId, paymentMethod)
      if (response.success) {
        if (paymentMethod === "paypal" && response.payment?.approvalUrl) {
          window.location.href = response.payment.approvalUrl
          return
        }
        if (paymentMethod === "card" && response.payment?.checkoutUrl) {
          window.location.href = response.payment.checkoutUrl
          return
        }
        toast({
          title: t("paymentModal.providerHired"),
          description: t("paymentModal.providerHiredDescription", { providerName }),
        })
        onSuccess(response.job)
        onClose()
      } else {
        throw new Error(response.message || "Payment failed")
      }
    } catch (error) {
      console.error("Payment error:", error)
      let errorMessage = t("paymentModal.paymentError")
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.message) {
        errorMessage = error.message
      }
      toast({
        title: t("paymentModal.paymentFailed"),
        description: errorMessage,
        variant: "destructive",
      })
      setIsSubmitting(false)
    }
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>{t("paymentModal.confirmPayment")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("paymentModal.serviceFeeDescription")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-4">
          <div className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>{t("paymentModal.jobBudget")}</span>
              <span>${amount}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t("paymentModal.serviceFee")}</span>
              <span>${(amount * 0.1).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>{t("paymentModal.total")}</span>
              <span>${(amount * 1.1).toFixed(2)}</span>
            </div>
          </div>
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium mb-2">{t("paymentModal.selectPaymentMethod")}</p>
            <div
              className={`border rounded-lg p-4 cursor-pointer flex items-center ${paymentMethod === "card" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setPaymentMethod("card")}
            >
              <CreditCard className="h-5 w-5 mr-2" />
              <span>{t("paymentModal.creditOrDebitCard")}</span>
            </div>
            <div
              className={`border rounded-lg p-4 cursor-pointer flex items-center ${paymentMethod === "paypal" ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onClick={() => setPaymentMethod("paypal")}
            >
              <Paypal className="h-5 w-5 mr-2" />
              <span>{t("paymentModal.payPal")}</span>
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("paymentModal.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={handlePayment} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("paymentModal.processing")}
              </>
            ) : (
              `${t("paymentModal.pay")} $${(amount * 1.1).toFixed(2)}`
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
