"use client";

import axios from "axios";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AddressAutocomplete } from "../../../components/ui/address-autocomplete";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { useCart } from "../../../hooks/use-cart";
import { api } from "../../../services/api";
import { useAuthStore } from "../../../stores/auth.store";

interface VoucherPreview {
  code: string;
  type: "PLATFORM" | "SHOP";
  discountAmount: number;
}

interface CheckoutResponse {
  aggregateId: string;
  status: string;
  paymentMethod: "COD" | "VNPAY";
  amount: string;
  currency: string;
  orders: Array<{ id: string; sellerId: string }>;
  payment: {
    txnRef: string;
    status: string;
    paymentUrl: string;
    expiresAt: string;
  } | null;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
  streetAddress?: string;
  city?: string;
  phone?: string;
  email?: string;
}

const IDEMPOTENCY_STORAGE_PREFIX = "ocop-checkout-idempotency";
const PENDING_PAYMENT_STORAGE_KEY = "ocop-pending-vnpay-payment";

function apiErrorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const payload = error.response?.data as
    | { message?: string | string[]; error?: { message?: string } }
    | undefined;
  if (Array.isArray(payload?.message)) return payload.message.join(", ");
  return payload?.message || payload?.error?.message || fallback;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { items, getTotalPrice, clearCart, getItemsBySeller } = useCart();
  const submittingRef = useRef(false);
  const [loading, setLoading] = useState(false);

  // ─── Tách họ và tên từ user?.fullName nếu có ──────────────────────────────
  const initialNames = useMemo(() => {
    if (!user?.fullName) return { lastName: "", firstName: "" };
    const parts = user.fullName.trim().split(/\s+/);
    if (parts.length === 1) return { lastName: "", firstName: parts[0] };
    return {
      lastName: parts.slice(0, -1).join(" "),
      firstName: parts[parts.length - 1],
    };
  }, [user]);

  // ─── Form Fields (Đầy đủ theo giao diện chuẩn) ────────────────────────────
  const [firstNameInput, setFirstName] = useState<string | null>(null);
  const [lastNameInput, setLastName] = useState<string | null>(null);
  const firstName = firstNameInput ?? initialNames.firstName;
  const lastName = lastNameInput ?? initialNames.lastName;
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("Việt Nam");
  const [streetAddress, setStreetAddress] = useState("");
  const [apartment, setApartment] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [phoneInput, setPhone] = useState<string | null>(null);
  const [emailInput, setEmail] = useState<string | null>(null);
  const phone = phoneInput ?? user?.phone ?? "";
  const email = emailInput ?? user?.email ?? "";
  const [note, setNote] = useState("");

  const [paymentMethod, setPaymentMethod] = useState<"COD" | "VNPAY">("COD");

  // ─── Validation Errors State ──────────────────────────────────────────────
  const [errors, setErrors] = useState<FormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // ─── Vouchers ─────────────────────────────────────────────────────────────
  const [showVoucherBox, setShowVoucherBox] = useState(false);
  const [platformVoucher, setPlatformVoucher] = useState<VoucherPreview | null>(
    null,
  );
  const [platformVoucherCode, setPlatformVoucherCode] = useState("");
  const [shopVoucherCodes, setShopVoucherCodes] = useState<
    Record<string, string>
  >({});
  const [shopVouchers, setShopVouchers] = useState<
    Record<string, VoucherPreview>
  >({});
  const [applyingVoucher, setApplyingVoucher] = useState<string | null>(null);

  const totalPrice = getTotalPrice();
  const itemsBySeller = getItemsBySeller();
  const sellerEntries = useMemo(
    () =>
      Object.entries(itemsBySeller).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    [itemsBySeller],
  );
  const shopDiscount = Object.values(shopVouchers).reduce(
    (total, voucher) => total + voucher.discountAmount,
    0,
  );
  const estimatedTotal = Math.max(
    0,
    totalPrice - (platformVoucher?.discountAmount ?? 0) - shopDiscount,
  );

  if (items.length === 0 && !loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-4 py-20 text-center">
        <h2 className="mb-4 text-2xl font-bold">Giỏ hàng của bạn đang trống</h2>
        <Button onClick={() => router.push("/products")}>Mua sắm ngay</Button>
      </div>
    );
  }

  const validateForm = () => {
    const newErrors: FormErrors = {};

    if (!firstName.trim()) {
      newErrors.firstName = "Mục Tên là mục bắt buộc.";
    }
    if (!lastName.trim()) {
      newErrors.lastName = "Mục Họ là mục bắt buộc.";
    }
    if (!streetAddress.trim()) {
      newErrors.streetAddress = "Mục Địa chỉ là mục bắt buộc.";
    }
    if (!city.trim()) {
      newErrors.city = "Mục Thị trấn / Thành phố là mục bắt buộc.";
    }
    if (!phone.trim()) {
      newErrors.phone = "Mục Số điện thoại là mục bắt buộc.";
    }
    if (!email.trim()) {
      newErrors.email = "Mục Địa chỉ email là mục bắt buộc.";
    }

    setErrors(newErrors);
    return newErrors;
  };

  const getIdempotencyKey = (fingerprint: string) => {
    if (!user) throw new Error("Người dùng chưa đăng nhập");
    const storageKey = `${IDEMPOTENCY_STORAGE_PREFIX}:${user.id}`;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem(storageKey) || "null",
      ) as { fingerprint?: string; idempotencyKey?: string } | null;
      if (
        saved?.fingerprint === fingerprint &&
        typeof saved.idempotencyKey === "string"
      ) {
        return saved.idempotencyKey;
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    const idempotencyKey = crypto.randomUUID();
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({ fingerprint, idempotencyKey }),
    );
    return idempotencyKey;
  };

  const handleCheckout = async () => {
    if (submittingRef.current) return;
    if (!user) {
      toast.error("Vui lòng đăng nhập để tiếp tục thanh toán");
      router.push("/login?redirect=/checkout");
      return;
    }

    setHasAttemptedSubmit(true);
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    // Tổng hợp thông tin địa chỉ chi tiết
    const fullShippingAddress = [
      apartment.trim(),
      streetAddress.trim(),
      city.trim(),
      country.trim(),
      postalCode.trim() ? `(Mã bưu điện: ${postalCode.trim()})` : "",
      company.trim() ? `(Công ty: ${company.trim()})` : "",
      `Người nhận: ${lastName.trim()} ${firstName.trim()}`,
      `Email: ${email.trim()}`,
    ]
      .filter(Boolean)
      .join(", ");

    const normalizedItems = items
      .map((item) => ({ productId: item.id, quantity: item.quantity }))
      .sort((left, right) => left.productId.localeCompare(right.productId));
    const normalizedShopVouchers = Object.entries(shopVouchers)
      .map(([sellerId, voucher]) => ({
        sellerId,
        code: voucher.code.trim().toUpperCase(),
      }))
      .sort((left, right) => left.sellerId.localeCompare(right.sellerId));

    const intent = {
      shippingAddress: fullShippingAddress,
      phone: phone.trim().replace(/\s+/g, ""),
      paymentMethod,
      items: normalizedItems,
      platformVoucherCode:
        platformVoucher?.code.trim().toUpperCase() || undefined,
      shopVouchers: normalizedShopVouchers,
      note: note.trim() || undefined,
    };
    const idempotencyKey = getIdempotencyKey(JSON.stringify(intent));

    submittingRef.current = true;
    setLoading(true);
    try {
      const response = await api.post<{ data: CheckoutResponse }>(
        "/api/v1/orders/checkout",
        { idempotencyKey, ...intent },
      );
      const checkout = response.data.data;
      if (!checkout?.aggregateId || checkout.orders.length === 0) {
        throw new Error("Phản hồi checkout không hợp lệ");
      }

      if (paymentMethod === "VNPAY") {
        if (!checkout.payment?.paymentUrl || !checkout.payment.txnRef) {
          throw new Error("Máy chủ không trả về phiên thanh toán VNPay");
        }
        sessionStorage.setItem(
          PENDING_PAYMENT_STORAGE_KEY,
          JSON.stringify({
            aggregateId: checkout.aggregateId,
            txnRef: checkout.payment.txnRef,
          }),
        );
        clearCart();
        toast.info("Đang chuyển hướng sang cổng thanh toán trực tuyến...");
        window.location.assign(checkout.payment.paymentUrl);
        return;
      }

      clearCart();
      sessionStorage.removeItem(`${IDEMPOTENCY_STORAGE_PREFIX}:${user.id}`);
      toast.success("Đặt hàng thành công!");
      router.push("/profile/orders");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Có lỗi xảy ra khi đặt hàng"));
      submittingRef.current = false;
      setLoading(false);
    }
  };

  const applyPlatformVoucher = async () => {
    const code = platformVoucherCode.trim();
    if (!code || sellerEntries.length === 0) return;
    setApplyingVoucher("platform");
    try {
      const response = await api.post<{ data: VoucherPreview }>(
        "/api/v1/vouchers/apply",
        {
          code,
          sellerId: sellerEntries[0][0],
          orderValue: totalPrice,
        },
      );
      if (response.data.data.type !== "PLATFORM") {
        toast.error("Đây không phải là mã của sàn");
        return;
      }
      setPlatformVoucher(response.data.data);
      toast.success("Áp dụng mã sàn thành công");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Mã không hợp lệ"));
    } finally {
      setApplyingVoucher(null);
    }
  };

  const applyShopVoucher = async (
    sellerId: string,
    sellerItems: typeof items,
  ) => {
    const code = (shopVoucherCodes[sellerId] || "").trim();
    if (!code) return;
    const sellerTotal = sellerItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    setApplyingVoucher(sellerId);
    try {
      const response = await api.post<{ data: VoucherPreview }>(
        "/api/v1/vouchers/apply",
        {
          code,
          sellerId,
          orderValue: sellerTotal,
        },
      );
      if (response.data.data.type !== "SHOP") {
        toast.error("Đây không phải là mã của shop");
        return;
      }
      setShopVouchers((current) => ({
        ...current,
        [sellerId]: response.data.data,
      }));
      toast.success(
        `Áp dụng mã cho ${sellerItems[0]?.sellerName || "shop"} thành công`,
      );
    } catch (error) {
      toast.error(apiErrorMessage(error, "Mã shop không hợp lệ"));
    } finally {
      setApplyingVoucher(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-12">
      {/* ─── Top Banner: Mã ưu đãi ────────────────────────────────────── */}
      <div className="mb-4 border-t-2 border-emerald-600 bg-slate-50 dark:bg-slate-900/40 p-4 text-sm text-slate-700 dark:text-slate-300 rounded-sm">
        Bạn có mã ưu đãi?{" "}
        <button
          type="button"
          onClick={() => setShowVoucherBox(!showVoucherBox)}
          className="font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
        >
          Ấn vào đây để nhập mã
        </button>
      </div>

      {/* ─── Khối hiển thị lỗi tổng hợp phía trên (chuẩn theo ảnh mẫu) ─── */}
      {hasAttemptedSubmit && Object.keys(errors).length > 0 && (
        <div className="mb-6 space-y-1.5 py-1">
          {errors.firstName && (
            <div className="font-bold text-sm text-[#b81c22] dark:text-red-400">
              {errors.firstName}
            </div>
          )}
          {errors.lastName && (
            <div className="font-bold text-sm text-[#b81c22] dark:text-red-400">
              {errors.lastName}
            </div>
          )}
          {errors.streetAddress && (
            <div className="font-bold text-sm text-[#b81c22] dark:text-red-400">
              {errors.streetAddress}
            </div>
          )}
          {errors.city && (
            <div className="font-bold text-sm text-[#b81c22] dark:text-red-400">
              {errors.city}
            </div>
          )}
          {errors.phone && (
            <div className="font-bold text-sm text-[#b81c22] dark:text-red-400">
              {errors.phone}
            </div>
          )}
          {errors.email && (
            <div className="font-bold text-sm text-[#b81c22] dark:text-red-400">
              {errors.email}
            </div>
          )}
        </div>
      )}

      {/* ─── Voucher Collapsible Box ──────────────────────────────────── */}
      {showVoucherBox && (
        <div className="mb-8 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs space-y-4">
          <h4 className="font-bold text-sm text-slate-900 dark:text-white">
            Nhập mã giảm giá của bạn
          </h4>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md">
            <Input
              placeholder="Nhập mã giảm giá sàn"
              value={platformVoucherCode}
              onChange={(event) =>
                setPlatformVoucherCode(event.target.value)
              }
              disabled={Boolean(platformVoucher)}
              className="h-10"
            />
            {platformVoucher ? (
              <Button
                type="button"
                variant="outline"
                className="border-red-500 text-red-500 shrink-0"
                onClick={() => {
                  setPlatformVoucher(null);
                  setPlatformVoucherCode("");
                }}
              >
                Hủy mã
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                onClick={applyPlatformVoucher}
                disabled={applyingVoucher !== null}
              >
                Áp dụng
              </Button>
            )}
          </div>

          {/* Shop vouchers */}
          {sellerEntries.length > 0 && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              {sellerEntries.map(([sellerId, sellerItems]) => {
                const applied = shopVouchers[sellerId];
                return (
                  <div key={sellerId} className="flex flex-col gap-1.5 max-w-md">
                    <span className="text-xs text-slate-500">
                      Mã giảm giá cho shop:{" "}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {sellerItems[0]?.sellerName}
                      </strong>
                    </span>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nhập mã voucher shop"
                        value={shopVoucherCodes[sellerId] || ""}
                        onChange={(event) =>
                          setShopVoucherCodes((current) => ({
                            ...current,
                            [sellerId]: event.target.value,
                          }))
                        }
                        disabled={Boolean(applied)}
                        className="h-10"
                      />
                      {applied ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="border-red-500 text-red-500 shrink-0"
                          onClick={() => {
                            setShopVouchers((current) => {
                              const next = { ...current };
                              delete next[sellerId];
                              return next;
                            });
                            setShopVoucherCodes((current) => ({
                              ...current,
                              [sellerId]: "",
                            }));
                          }}
                        >
                          Hủy mã
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="shrink-0"
                          onClick={() =>
                            applyShopVoucher(sellerId, sellerItems)
                          }
                          disabled={applyingVoucher !== null}
                        >
                          Áp dụng
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Main Content Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-12 items-start">
        {/* ─── Cột trái: Form thông tin thanh toán & bổ sung ────────────── */}
        <div className="flex flex-col lg:col-span-7 space-y-8">
          <div>
            <h2 className="text-base font-black tracking-wider uppercase text-slate-900 dark:text-white mb-6">
              THÔNG TIN THANH TOÁN
            </h2>

            <div className="space-y-4">
              {/* Tên & Họ */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Tên <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      if (errors.firstName)
                        setErrors((prev) => ({ ...prev, firstName: undefined }));
                    }}
                    placeholder=""
                    required
                    className={`h-10 bg-white dark:bg-slate-900 ${
                      errors.firstName
                        ? "border-[#e2401c] focus:border-[#e2401c] focus:ring-[#e2401c]/20"
                        : "border-slate-300 dark:border-slate-700"
                    }`}
                  />
                  {errors.firstName && (
                    <p className="mt-1 text-xs text-[#b81c22] dark:text-red-400 font-medium">
                      {errors.firstName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    Họ <span className="text-red-500">*</span>
                  </label>
                  <Input
                    value={lastName}
                    onChange={(e) => {
                      setLastName(e.target.value);
                      if (errors.lastName)
                        setErrors((prev) => ({ ...prev, lastName: undefined }));
                    }}
                    placeholder=""
                    required
                    className={`h-10 bg-white dark:bg-slate-900 ${
                      errors.lastName
                        ? "border-[#e2401c] focus:border-[#e2401c] focus:ring-[#e2401c]/20"
                        : "border-slate-300 dark:border-slate-700"
                    }`}
                  />
                  {errors.lastName && (
                    <p className="mt-1 text-xs text-[#b81c22] dark:text-red-400 font-medium">
                      {errors.lastName}
                    </p>
                  )}
                </div>
              </div>

              {/* Tên công ty (tuỳ chọn) */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Tên công ty (tuỳ chọn)
                </label>
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder=""
                  className="h-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
              </div>

              {/* Quốc gia / Khu vực */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Quốc gia/Khu vực <span className="text-red-500">*</span>
                </label>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Việt Nam">Việt Nam</option>
                </select>
              </div>

              {/* Địa chỉ (2 ô) */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Địa chỉ <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    className={
                      errors.streetAddress ? "[&_input]:border-[#e2401c]" : ""
                    }
                  >
                    <AddressAutocomplete
                      value={streetAddress}
                      onChange={(val) => {
                        setStreetAddress(val);
                        if (errors.streetAddress)
                          setErrors((prev) => ({
                            ...prev,
                            streetAddress: undefined,
                          }));
                        if (!city && val.includes(",")) {
                          const parts = val.split(",").map((p) => p.trim());
                          if (parts.length >= 2) {
                            setCity(
                              parts[parts.length - 1] || parts[parts.length - 2],
                            );
                            if (errors.city)
                              setErrors((prev) => ({
                                ...prev,
                                city: undefined,
                              }));
                          }
                        }
                      }}
                      placeholder="Địa chỉ"
                    />
                  </div>
                  <Input
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    placeholder="Căn hộ, dãy phòng, đơn vị,... (không bắt buộc)"
                    className="h-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                  />
                </div>
                {errors.streetAddress && (
                  <p className="mt-1 text-xs text-[#b81c22] dark:text-red-400 font-medium">
                    {errors.streetAddress}
                  </p>
                )}
              </div>

              {/* Mã bưu điện (tuỳ chọn) */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Mã bưu điện (tuỳ chọn)
                </label>
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder=""
                  className="h-10 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                />
              </div>

              {/* Thị trấn / Thành phố */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Thị trấn / Thành phố <span className="text-red-500">*</span>
                </label>
                <Input
                  value={city}
                  onChange={(e) => {
                    setCity(e.target.value);
                    if (errors.city)
                      setErrors((prev) => ({ ...prev, city: undefined }));
                  }}
                  placeholder=""
                  required
                  className={`h-10 bg-white dark:bg-slate-900 ${
                    errors.city
                      ? "border-[#e2401c] focus:border-[#e2401c] focus:ring-[#e2401c]/20"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                />
                {errors.city && (
                  <p className="mt-1 text-xs text-[#b81c22] dark:text-red-400 font-medium">
                    {errors.city}
                  </p>
                )}
              </div>

              {/* Số điện thoại */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Số điện thoại <span className="text-red-500">*</span>
                </label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone)
                      setErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  placeholder=""
                  required
                  className={`h-10 bg-white dark:bg-slate-900 ${
                    errors.phone
                      ? "border-[#e2401c] focus:border-[#e2401c] focus:ring-[#e2401c]/20"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-[#b81c22] dark:text-red-400 font-medium">
                    {errors.phone}
                  </p>
                )}
              </div>

              {/* Địa chỉ email */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                  Địa chỉ email <span className="text-red-500">*</span>
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errors.email)
                      setErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  placeholder=""
                  required
                  className={`h-10 bg-white dark:bg-slate-900 ${
                    errors.email
                      ? "border-[#e2401c] focus:border-[#e2401c] focus:ring-[#e2401c]/20"
                      : "border-slate-300 dark:border-slate-700"
                  }`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-[#b81c22] dark:text-red-400 font-medium">
                    {errors.email}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ─── Thông tin bổ sung ─────────────────────────────────────── */}
          <div>
            <h2 className="text-base font-black tracking-wider uppercase text-slate-900 dark:text-white mb-4">
              THÔNG TIN BỔ SUNG
            </h2>
            <div>
              <label className="block text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                Ghi chú đơn hàng (tuỳ chọn)
              </label>
              <textarea
                rows={4}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ghi chú về đơn hàng, ví dụ: thời gian hay chỉ dẫn địa điểm giao hàng chi tiết hơn."
                className="w-full p-3 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y"
              />
            </div>
          </div>
        </div>

        {/* ─── Cột phải: Hộp ĐƠN HÀNG CỦA BẠN (Viền xanh) ─────────────── */}
        <div className="lg:col-span-5">
          <div className="sticky top-24 rounded-lg border-2 border-[#458252] bg-white dark:bg-slate-900 p-6 shadow-xs">
            <h3 className="text-lg font-black uppercase tracking-wide text-slate-900 dark:text-white mb-6">
              ĐƠN HÀNG CỦA BẠN
            </h3>

            {/* Bảng SẢN PHẨM | TẠM TÍNH */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 text-sm font-bold uppercase text-slate-800 dark:text-slate-200">
              <span>SẢN PHẨM</span>
              <span>TẠM TÍNH</span>
            </div>

            {/* Danh sách các sản phẩm */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60 max-h-[300px] overflow-y-auto pr-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <span className="text-slate-700 dark:text-slate-300 pr-4">
                    {item.name}{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      × {item.quantity}
                    </span>
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white shrink-0">
                    {(item.price * item.quantity).toLocaleString("vi-VN")} ₫
                  </span>
                </div>
              ))}
            </div>

            {/* Tạm tính */}
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 py-3 text-sm">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                Tạm tính
              </span>
              <span className="font-bold text-slate-900 dark:text-white">
                {totalPrice.toLocaleString("vi-VN")} ₫
              </span>
            </div>

            {/* Giảm giá sàn / shop nếu có */}
            {platformVoucher && (
              <div className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-600 dark:text-slate-400">
                  Giảm giá sàn ({platformVoucher.code})
                </span>
                <span className="font-bold text-red-500">
                  - {platformVoucher.discountAmount.toLocaleString("vi-VN")} ₫
                </span>
              </div>
            )}
            {Object.entries(shopVouchers).map(([sellerId, voucher]) => (
              <div
                key={sellerId}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="text-slate-600 dark:text-slate-400">
                  Giảm giá shop ({voucher.code})
                </span>
                <span className="font-bold text-red-500">
                  - {voucher.discountAmount.toLocaleString("vi-VN")} ₫
                </span>
              </div>
            ))}

            {/* Tổng cộng */}
            <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 py-3 text-base">
              <span className="font-black text-slate-900 dark:text-white">
                Tổng
              </span>
              <span className="font-black text-lg text-slate-900 dark:text-white">
                {estimatedTotal.toLocaleString("vi-VN")} ₫
              </span>
            </div>

            {/* Phương thức thanh toán (Radio group) */}
            <div className="mt-4 space-y-3 border-t border-slate-200 dark:border-slate-800 pt-4">
              {/* Option 1: Trả tiền mặt khi nhận hàng (COD) */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={() => setPaymentMethod("COD")}
                    className="h-4 w-4 text-[#458252] focus:ring-[#458252]"
                  />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Trả tiền mặt khi nhận hàng
                  </span>
                </label>
                {paymentMethod === "COD" && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 pl-7">
                    Trả tiền mặt khi giao hàng.
                  </p>
                )}
              </div>

              {/* Option 2: Debit & Credit Cards (VNPay) */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="VNPAY"
                    checked={paymentMethod === "VNPAY"}
                    onChange={() => setPaymentMethod("VNPAY")}
                    className="h-4 w-4 text-[#458252] focus:ring-[#458252]"
                  />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    Debit & Credit Cards
                  </span>
                </label>
                {paymentMethod === "VNPAY" && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 pl-7">
                    Thanh toán an toàn qua thẻ ATM, Visa, MasterCard hoặc Ví
                    VNPay.
                  </p>
                )}
              </div>
            </div>

            {/* Nút Đặt hàng */}
            <div className="mt-6">
              <button
                type="button"
                onClick={handleCheckout}
                disabled={loading}
                className="w-full h-12 bg-[#458252] hover:bg-[#386c43] text-white font-bold text-base rounded-md transition-colors shadow-sm disabled:opacity-50 cursor-pointer flex items-center justify-center"
              >
                {loading
                  ? "Đang xử lý..."
                  : paymentMethod === "VNPAY"
                    ? "Proceed to Payment"
                    : "Đặt hàng"}
              </button>
            </div>

            {/* Chú thích chính sách riêng tư */}
            <p className="mt-4 text-xs text-slate-500 dark:text-slate-400 leading-relaxed text-justify">
              Thông tin cá nhân của bạn sẽ được sử dụng để xử lý đơn hàng, tăng
              trải nghiệm sử dụng website, và cho các mục đích cụ thể khác đã
              được mô tả trong chính sách riêng tư của chúng tôi.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
