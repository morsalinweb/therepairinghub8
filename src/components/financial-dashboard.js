"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, DollarSign, CreditCard, TrendingUp, ArrowDownToLine, Wallet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { paymentAPI } from "@/lib/api"

export default function FinancialDashboard() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [withdrawAmount, setWithdrawAmount] = useState("")
  const [withdrawPaypalEmail, setWithdrawPaypalEmail] = useState("")
  const [isWithdrawing, setIsWithdrawing] = useState(false)
  const [financialData, setFinancialData] = useState({
    availableBalance: 0,
    totalEarnings: 0,
    totalSpending: 0,
    recentTransactions: [],
    spendingByCategory: [],
    earningsTrend: [],
  })

  // Update the useEffect to improve real-time updates
  useEffect(() => {
    fetchFinancialData()

    // Pre-fill PayPal email if available
    if (user?.paypalEmail) {
      setWithdrawPaypalEmail(user.paypalEmail)
    }

    // Set up polling for real-time updates - more frequent polling
    const interval = setInterval(fetchFinancialData, 10000) // Update every 10 seconds

    // Subscribe to payment events via websocket if available
    if (window.socket) {
      console.log("Setting up financial dashboard websocket listeners")

      const handlePaymentUpdate = () => {
        console.log("Payment update received, refreshing financial data")
        fetchFinancialData()
      }

      window.socket.on("payment_updated", handlePaymentUpdate)
      window.socket.on("transaction_updated", handlePaymentUpdate)
      window.socket.on("escrow_released", handlePaymentUpdate)

      return () => {
        clearInterval(interval)
        window.socket.off("payment_updated", handlePaymentUpdate)
        window.socket.off("transaction_updated", handlePaymentUpdate)
        window.socket.off("escrow_released", handlePaymentUpdate)
      }
    }

    return () => clearInterval(interval)
  }, [user])

  // Update PayPal email when user data changes
  useEffect(() => {
    if (user?.paypalEmail && !withdrawPaypalEmail) {
      setWithdrawPaypalEmail(user.paypalEmail)
    }
  }, [user?.paypalEmail, withdrawPaypalEmail])

  const fetchFinancialData = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/users/financial-dashboard", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
        },
      })
      const data = await response.json()

      if (data.success) {
        console.log("Financial data received:", data.financialData)
        setFinancialData(data.financialData)
      } else {
        console.error("Failed to fetch financial data:", data.message)
        toast({
          title: "Error",
          description: data.message || "Failed to load financial data",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error fetching financial data:", error)
      toast({
        title: "Error",
        description: "Failed to load financial data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(withdrawAmount) || Number.parseFloat(withdrawAmount) <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid withdrawal amount",
        variant: "destructive",
      })
      return
    }

    if (!withdrawPaypalEmail || !withdrawPaypalEmail.includes("@")) {
      toast({
        title: "PayPal email required",
        description: "Please enter a valid PayPal email address",
        variant: "destructive",
      })
      return
    }

    const amount = Number.parseFloat(withdrawAmount)

    if (amount > financialData.availableBalance) {
      toast({
        title: "Insufficient funds",
        description: `You don't have enough funds to withdraw this amount. Available balance: $${financialData.availableBalance.toFixed(2)}`,
        variant: "destructive",
      })
      return
    }

    setIsWithdrawing(true)

    try {
      console.log(`Attempting to withdraw ${amount} to PayPal email: ${withdrawPaypalEmail}`)

      // If PayPal email is different from user's saved email, update it first
      if (withdrawPaypalEmail !== user?.paypalEmail) {
        await fetch(`/api/users/${user._id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
          },
          body: JSON.stringify({ paypalEmail: withdrawPaypalEmail }),
        })
      }

      const result = await paymentAPI.processWithdrawal(amount)

      if (result.success) {
        toast({
          title: "Withdrawal initiated",
          description: result.message || `$${amount} is being sent to your PayPal account.`,
        })

        // Update financial data
        setFinancialData((prev) => ({
          ...prev,
          availableBalance: result.newBalance || prev.availableBalance - amount,
        }))

        setWithdrawAmount("")

        // Refresh financial data
        fetchFinancialData()
      } else {
        toast({
          title: "Withdrawal failed",
          description: result.message || "There was a problem processing your withdrawal",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Withdrawal error:", error)
      toast({
        title: "Withdrawal failed",
        description: "There was a problem processing your withdrawal",
        variant: "destructive",
      })
    } finally {
      setIsWithdrawing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Show different data based on user type
  const isSeller = user?.userType === "Seller"
  const isBuyer = user?.userType === "Buyer"

  return (
    <div className="space-y-6">
      {/* Financial Overview Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Available Balance - Show for Sellers only */}
        {isSeller && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Available Balance</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${financialData.availableBalance.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">Available for withdrawal</p>
            </CardContent>
          </Card>
        )}

        {/* Total Earnings - Show for Sellers */}
        {isSeller && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${financialData.totalEarnings.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">From completed jobs</p>
            </CardContent>
          </Card>
        )}

        {/* Total Spending - Show for Buyers */}
        {isBuyer && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Spending</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${financialData.totalSpending.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">On services</p>
            </CardContent>
          </Card>
        )}

        {/* Net Balance - Show appropriate data for each user type */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{isSeller ? "Net Earnings" : "Total Spending"}</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isSeller
                ? `$${(financialData.totalEarnings - financialData.totalSpending).toFixed(2)}`
                : `$${financialData.totalSpending.toFixed(2)}`}
            </div>
            <p className="text-xs text-muted-foreground">
              {isSeller ? "Earnings minus expenses" : "Total amount spent"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Withdrawal Section - Show for Sellers only */}
      {isSeller && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-medium">Withdraw Earnings</CardTitle>
            <CardDescription>Withdraw your earnings to your PayPal account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="withdrawAmount">Withdrawal Amount</Label>
                  <Input
                    id="withdrawAmount"
                    placeholder="Enter amount to withdraw"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={financialData.availableBalance}
                  />
                </div>
                <div>
                  <Label htmlFor="withdrawPaypalEmail">PayPal Email</Label>
                  <Input
                    id="withdrawPaypalEmail"
                    type="email"
                    placeholder="Enter PayPal email"
                    value={withdrawPaypalEmail}
                    onChange={(e) => setWithdrawPaypalEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handleWithdraw}
                  disabled={isWithdrawing || financialData.availableBalance <= 0}
                  className="w-full md:w-auto"
                >
                  {isWithdrawing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="mr-2 h-4 w-4" />
                      Withdraw
                    </>
                  )}
                </Button>
              </div>
              <div className="text-sm text-muted-foreground">
                <p>
                  <span className="font-medium">Available Balance:</span> ${financialData.availableBalance.toFixed(2)}
                </p>
                {user?.paypalEmail && (
                  <p>
                    <span className="font-medium">Saved PayPal Email:</span> {user.paypalEmail}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs for detailed financial data */}
      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
          <TabsTrigger value="analysis">{isSeller ? "Earnings Analysis" : "Spending Analysis"}</TabsTrigger>
        </TabsList>

        {/* Recent Transactions Tab */}
        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your recent payment activity and transaction history</CardDescription>
            </CardHeader>
            <CardContent>
              {financialData.recentTransactions.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No transactions found</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isBuyer
                      ? "Start by hiring a service provider to see your transactions here."
                      : "Complete some jobs to see your earnings here."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {financialData.recentTransactions.map((transaction, index) => (
                    <div key={transaction.id || index} className="flex items-center justify-between border-b pb-4">
                      <div className="flex-1">
                        <p className="font-medium">{transaction.jobTitle || transaction.description}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(transaction.date).toLocaleDateString("en-US", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          {transaction.category && <span> • {transaction.category}</span>}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`font-medium ${
                            transaction.type === "withdrawal"
                              ? "text-red-500"
                              : transaction.type === "job_payment" && isSeller
                                ? "text-green-500"
                                : transaction.type === "job_earning"
                                  ? "text-green-500"
                                  : "text-red-500"
                          }`}
                        >
                          {transaction.type === "withdrawal" || (transaction.type === "job_payment" && isBuyer)
                            ? "-"
                            : "+"}
                          ${transaction.amount.toFixed(2)}
                        </p>
                        <p className="text-xs capitalize text-muted-foreground">{transaction.status}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{isSeller ? "Earnings Analysis" : "Spending Analysis"}</CardTitle>
              <CardDescription>
                {isSeller
                  ? "Your earnings breakdown and trends over time"
                  : "How your spending is distributed across different service categories"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(isSeller ? financialData.earningsTrend : financialData.spendingByCategory).length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">No {isSeller ? "earnings" : "spending"} data available</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    {isSeller
                      ? "Complete some jobs to see your earnings analysis."
                      : "Start hiring services to see your spending breakdown."}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {(isSeller ? financialData.earningsTrend : financialData.spendingByCategory).map((item, index) => (
                    <div key={index} className="flex items-center">
                      <div
                        className="w-4 h-4 rounded-full mr-3"
                        style={{ backgroundColor: getColorForIndex(index) }}
                      ></div>
                      <div className="flex-1">
                        <div className="flex justify-between mb-1">
                          <span className="font-medium">{isSeller ? item.month : item.category}</span>
                          <span className="font-medium">${item.amount.toFixed(2)}</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                          <div
                            className="h-2.5 rounded-full"
                            style={{
                              width: `${((item.amount / getMaxAmount(isSeller ? financialData.earningsTrend : financialData.spendingByCategory)) * 100).toFixed(0)}%`,
                              backgroundColor: getColorForIndex(index),
                            }}
                          ></div>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {isSeller
                            ? index > 0 && financialData.earningsTrend[index - 1]
                              ? item.amount > financialData.earningsTrend[index - 1].amount
                                ? "↗ Increased from last month"
                                : item.amount < financialData.earningsTrend[index - 1].amount
                                  ? "↘ Decreased from last month"
                                  : "→ Same as last month"
                              : "First month"
                            : `${((item.amount / getTotalAmount(financialData.spendingByCategory)) * 100).toFixed(1)}% of total spending`}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// Helper functions for charts
function getColorForIndex(index) {
  const colors = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D", "#FF6B6B", "#4ECDC4"]
  return colors[index % colors.length]
}

function getTotalAmount(data) {
  return data.reduce((sum, item) => sum + item.amount, 0)
}

function getMaxAmount(data) {
  return Math.max(...data.map((item) => item.amount), 0.01) // Avoid division by zero
}
