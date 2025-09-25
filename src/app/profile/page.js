"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Loader2, Save, UserIcon, Star } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { useAuth } from "@/contexts/auth-context"
import { useTranslation } from "@/lib/i18n"
import { userAPI, reviewAPI } from "@/lib/api"
import FinancialDashboard from "@/components/financial-dashboard"
import DeleteAccountModal from "@/components/delete-account-modal"

export default function ProfilePage() {
  const { t } = useTranslation()
  const { user, loading, updateUserData } = useAuth()
  const router = useRouter()
  const { toast } = useToast()
  const [isUpdating, setIsUpdating] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState("")
  const [avatarFile, setAvatarFile] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [reviews, setReviews] = useState([])
  const [reviewsLoading, setReviewsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm()

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login")
    }
    if (user) {
      const formData = {
        name: user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        address: user.address || "",
        bio: user.bio || "",
        skills: user.skills ? user.skills.join(", ") : "",
        paypalEmail: user.paypalEmail || "",
      }
      reset(formData)
      if (user.avatar) {
        setAvatarPreview(user.avatar)
      }
      fetchUserReviews()
    }
  }, [user, loading, reset, router])

  const fetchUserReviews = async () => {
    if (!user?._id) return

    setReviewsLoading(true)
    try {
      const { success, reviews } = await reviewAPI.getReviews({ user: user._id })
      if (success) {
        const sortedReviews = reviews.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        setReviews(sortedReviews)
      }
    } catch (error) {
      console.error("Error fetching reviews:", error)
    } finally {
      setReviewsLoading(false)
    }
  }

  const renderStars = (rating) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star key={i} className={`h-4 w-4 ${i < rating ? "text-yellow-400 fill-current" : "text-gray-300"}`} />
    ))
  }

  const handleAvatarChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result)
      }
      reader.readAsDataURL(file)
    }
  }

  const onSubmit = async (data) => {
    setIsUpdating(true)
    try {
      const formattedData = {
        ...data,
        skills: data.skills
          ? data.skills
              .split(",")
              .map((skill) => skill.trim())
              .filter((skill) => skill)
          : [],
      }
      if (avatarFile) {
        formattedData.avatar = avatarPreview
      }
      const result = await userAPI.updateProfile(formattedData)
      if (result.success) {
        toast({
          title: t("profilePage.profileUpdated"),
          description: t("messages.success.profileUpdated"),
        })
        if (updateUserData) {
          updateUserData(result.user)
        }
      } else {
        toast({
          title: t("profilePage.updateFailed"),
          description: result.message || t("messages.error.generic"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Profile update error:", error)
      toast({
        title: t("profilePage.updateFailed"),
        description: t("messages.error.generic"),
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      const result = await userAPI.deleteAccount(user._id)
      if (result.success) {
        setShowDeleteModal(false)
      }
    } catch (error) {
      console.error("Delete account error:", error)
      toast({
        title: t("profilePage.deletionFailed"),
        description: t("messages.error.generic"),
        variant: "destructive",
      })
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6">{t("profilePage.title")}</h1>
      <Tabs defaultValue="profile" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">{t("profilePage.profileInformation")}</TabsTrigger>
          <TabsTrigger value="reviews">{t("profilePage.myReviews")}</TabsTrigger>
          <TabsTrigger value="account">{t("profilePage.accountSettings")}</TabsTrigger>
          <TabsTrigger value="payment">{t("profilePage.paymentSettings")}</TabsTrigger>
          <TabsTrigger value="finance">{t("profilePage.financialDashboard")}</TabsTrigger>
        </TabsList>
        <form onSubmit={handleSubmit(onSubmit)}>
          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>{t("profilePage.profileInformation")}</CardTitle>
                <CardDescription>{t("profilePage.profileDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={avatarPreview || "/placeholder.svg?height=96&width=96"} alt={user?.name} />
                    <AvatarFallback>
                      <UserIcon className="h-12 w-12" />
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <Label htmlFor="avatar" className="block mb-2">
                      {t("profilePage.profilePicture")}
                    </Label>
                    <Input id="avatar" type="file" accept="image/*" onChange={handleAvatarChange} />
                    <p className="text-sm text-muted-foreground mt-1">
                      {t("profilePage.profilePictureRecommendation")}
                    </p>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("profilePage.fullName")}</Label>
                    <Input
                      id="name"
                      {...register("name", { required: t("messages.validation.required") })}
                      placeholder={t("profilePage.fullNamePlaceholder")}
                    />
                    {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">{t("profilePage.emailAddress")}</Label>
                    <Input
                      id="email"
                      type="email"
                      {...register("email", {
                        required: t("messages.validation.required"),
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: t("messages.validation.emailInvalid"),
                        },
                      })}
                      placeholder={t("profilePage.emailPlaceholder")}
                      disabled
                    />
                    {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">{t("profilePage.phoneNumber")}</Label>
                    <Input id="phone" {...register("phone")} placeholder={t("profilePage.phonePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">{t("profilePage.address")}</Label>
                    <Input id="address" {...register("address")} placeholder={t("profilePage.addressPlaceholder")} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">{t("profilePage.bio")}</Label>
                  <Textarea
                    id="bio"
                    {...register("bio")}
                    placeholder={t("profilePage.bioPlaceholder")}
                    className="min-h-[100px]"
                  />
                </div>
                {user?.userType === "Seller" && (
                  <div className="space-y-2">
                    <Label htmlFor="skills">{t("profilePage.skills")}</Label>
                    <Input id="skills" {...register("skills")} placeholder={t("profilePage.skillsPlaceholder")} />
                  </div>
                )}
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("profilePage.saving")}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {t("profilePage.saveChanges")}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="reviews">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>
                    {t("profilePage.myReviews")} ({reviews.length})
                  </span>
                  {user?.rating && (
                    <div className="flex items-center space-x-2">
                      <div className="flex items-center space-x-1">{renderStars(Math.round(user.rating))}</div>
                      <span className="text-sm text-muted-foreground">
                        {user.rating.toFixed(1)} ({user.reviewCount || 0} {t("profilePage.reviews")})
                      </span>
                    </div>
                  )}
                </CardTitle>
                <CardDescription>{t("profilePage.reviewsDescription")}</CardDescription>
              </CardHeader>
              <CardContent>
                {reviewsLoading ? (
                  <div className="flex justify-center items-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">{t("profilePage.noReviewsReceived")}</p>
                    <p className="text-sm text-muted-foreground mt-2">{t("profilePage.reviewsWillAppearHere")}</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {reviews.map((review) => (
                      <div key={review._id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center">
                            <Avatar className="h-10 w-10 mr-3">
                              <AvatarImage
                                src={review.reviewer.avatar || "/placeholder.svg?height=40&width=40"}
                                alt={review.reviewer.name}
                              />
                              <AvatarFallback>
                                {review.reviewer.name
                                  ? review.reviewer.name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                  : "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{review.reviewer.name}</p>
                              <div className="flex items-center">
                                {renderStars(review.rating)}
                                <span className="ml-2 text-sm text-muted-foreground">
                                  {new Date(review.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        <p className="text-foreground">{review.comment}</p>
                        {review.job && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {t("profilePage.reviewForJob")}: {review.job.title}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>{t("profilePage.accountSettings")}</CardTitle>
                <CardDescription>{t("profilePage.accountDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="current-password">{t("profilePage.currentPassword")}</Label>
                  <Input
                    id="current-password"
                    type="password"
                    {...register("currentPassword")}
                    placeholder={t("profilePage.currentPasswordPlaceholder")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("profilePage.newPassword")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    {...register("newPassword", {
                      minLength: {
                        value: 6,
                        message: t("messages.validation.passwordTooShort"),
                      },
                    })}
                    placeholder={t("profilePage.newPasswordPlaceholder")}
                  />
                  {errors.newPassword && <p className="text-sm text-red-500">{errors.newPassword.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("profilePage.confirmNewPassword")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    {...register("confirmPassword", {
                      validate: (value, formValues) => {
                        if (formValues.newPassword && value !== formValues.newPassword) {
                          return t("messages.validation.passwordsNotMatch")
                        }
                      },
                    })}
                    placeholder={t("profilePage.confirmNewPasswordPlaceholder")}
                  />
                  {errors.confirmPassword && <p className="text-sm text-red-500">{errors.confirmPassword.message}</p>}
                </div>
                <div className="border-t pt-6">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-medium text-red-600">{t("profilePage.dangerZone")}</h3>
                      <p className="text-sm text-muted-foreground">{t("profilePage.dangerZoneDescription")}</p>
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => setShowDeleteModal(true)}
                      className="w-full sm:w-auto"
                    >
                      {t("profilePage.deleteMyAccount")}
                    </Button>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("profilePage.saving")}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {t("profilePage.saveChanges")}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
          <TabsContent value="payment">
            <Card>
              <CardHeader>
                <CardTitle>{t("profilePage.paymentSettings")}</CardTitle>
                <CardDescription>{t("profilePage.paymentDescription")}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="paypal-email">{t("profilePage.paypalEmail")}</Label>
                  <Input
                    id="paypal-email"
                    type="email"
                    {...register("paypalEmail", {
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: t("messages.validation.emailInvalid"),
                      },
                    })}
                    placeholder={t("profilePage.paypalEmailPlaceholder")}
                  />
                  {errors.paypalEmail && <p className="text-sm text-red-500">{errors.paypalEmail.message}</p>}
                  <p className="text-sm text-muted-foreground mt-1">{t("profilePage.paypalEmailDescription")}</p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button type="submit" disabled={isUpdating}>
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t("profilePage.saving")}
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      {t("profilePage.saveChanges")}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </TabsContent>
        </form>
        <TabsContent value="finance">
          <FinancialDashboard />
        </TabsContent>
      </Tabs>
      <DeleteAccountModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteAccount}
        userEmail={user?.email || ""}
      />
    </div>
  )
}
