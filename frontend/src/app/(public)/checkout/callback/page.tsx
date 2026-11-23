"use client";

import axios from "axios";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";
import { api } from "../../../../services/api";

type ViewStatus = "loading" | "success" | "pending" | "error";

interface ReturnVerification {
  signatureValid: boolean;
  txnRef?: string | null;
  gatewayReportedSuccess?: boolean;
  success: boolean;
  paymentStatus?: string;
  aggregateStatus?: string;
  message: string;
}

interface PaymentStatusResponse {
  aggregateId: string;
  status: string;
  reconciliationReason?: string | null;
  transactions: Array<{
    txnRef: string;
    status: string;
    paymentUrl?: string;
  }>;
}

interface RetryPaymentResponse {
  aggregateId: string;
  txnRef: string;
  paymentUrl: string;
}

const PENDING_PAYMENT_STORAGE_KEY = "ocop-pending-vnpay-payment";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 30;

function errorMessage(error: unknown, fallback: string) {
  if (!axios.isAxiosError(error)) return fallback;
  const payload = error.response?.data as
    { message?: string | string[]; error?: { message?: string } } | undefined;
  if (Array.isArray(payload?.message)) return payload.message.join(", ");
  return payload?.message || payload?.error?.message || fallback;
}

function delay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryString = searchParams.toString();
  const [status, setStatus] = useState<ViewStatus>("loading");
  const [message, setMessage] = useState("Đang chờ máy chủ xác nhận IPN...");
  const [aggregateId, setAggregateId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryAllowed, setRetryAllowed] = useState(false);

  useEffect(() => {
    const abortController = new AbortController();

    const verifyAndPoll = async () => {
      if (!queryString) {
        setStatus("error");
        setMessage("VNPay không trả về dữ liệu giao dịch");
        return;
      }

      try {
        const verificationResponse = await api.get<{
          data: ReturnVerification;
        }>(`/api/v1/payments/vnpay-return?${queryString}`, {
          signal: abortController.signal,
        });
        const verification = verificationResponse.data.data;
        if (!verification.signatureValid || !verification.txnRef) {
          setStatus("error");
          setMessage(verification.message || "Chữ ký VNPay không hợp lệ");
          return;
        }

        let storedAggregateId: string | null = null;
        try {
          const saved = JSON.parse(
            sessionStorage.getItem(PENDING_PAYMENT_STORAGE_KEY) || "null",
          ) as { aggregateId?: string; txnRef?: string } | null;
          if (saved?.txnRef === verification.txnRef) {
            storedAggregateId = saved.aggregateId || null;
            setAggregateId(storedAggregateId);
          }
        } catch {
          sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
        }

        for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          if (abortController.signal.aborted) return;
          const statusResponse = await api.get<{
            data: PaymentStatusResponse;
          }>(
            `/api/v1/payments/transactions/${encodeURIComponent(
              verification.txnRef,
            )}/status`,
            { signal: abortController.signal },
          );
          const payment = statusResponse.data.data;
          setAggregateId(payment.aggregateId || storedAggregateId);

          if (payment.status === "COMPLETED") {
            sessionStorage.removeItem(PENDING_PAYMENT_STORAGE_KEY);
            setRetryAllowed(false);
            setStatus("success");
            setMessage("Thanh toán đã được IPN/QUERYDR xác nhận an toàn.");
            return;
          }
          if (["FAILED", "EXPIRED"].includes(payment.status)) {
            setRetryAllowed(true);
            setStatus("error");
            setMessage(
              payment.status === "EXPIRED"
                ? "Phiên thanh toán đã hết hạn và VNPay xác nhận chưa thu tiền."
                : "VNPay xác nhận giao dịch không thành công.",
            );
            return;
          }
          if (payment.status === "CANCELLED") {
            setRetryAllowed(false);
            setStatus("error");
            setMessage("Checkout đã bị hủy.");
            return;
          }
          if (
            ["REFUND_PENDING", "REFUNDED", "REFUND_FAILED"].includes(
              payment.status,
            )
          ) {
            setRetryAllowed(false);
            setStatus("pending");
            setMessage(
              payment.status === "REFUNDED"
                ? "Khoản thanh toán đã được hoàn lại do đơn hàng không thể tiếp tục."
                : "Tiền đã được ghi nhận nhưng đơn hàng cần xử lý hoàn tiền. Vui lòng theo dõi trong danh sách đơn hàng.",
            );
            return;
          }
          if (payment.status === "RECONCILIATION_REQUIRED") {
            setRetryAllowed(false);
            setStatus("pending");
            setMessage(
              payment.reconciliationReason ||
                "Trạng thái từ VNPay đang được đối soát; hệ thống chưa kết luận thất bại.",
            );
            return;
          }

          setStatus("loading");
          setMessage(
            verification.gatewayReportedSuccess
              ? "VNPay báo giao dịch thành công; đang chờ IPN xác nhận trên máy chủ."
              : "Đang chờ máy chủ xác nhận trạng thái giao dịch.",
          );
          await delay(POLL_INTERVAL_MS, abortController.signal);
        }

        setStatus("pending");
        setRetryAllowed(false);
        setMessage(
          "Chưa nhận được kết quả cuối cùng sau 60 giây. Đơn hàng vẫn được giữ để đối soát; vui lòng kiểm tra lại trong danh sách đơn hàng.",
        );
      } catch (error) {
        if (abortController.signal.aborted) return;
        setStatus("error");
        setMessage(errorMessage(error, "Không thể xác minh giao dịch"));
      }
    };

    void verifyAndPoll();
    return () => abortController.abort();
  }, [queryString]);

  const retryPayment = async () => {
    if (!aggregateId || retrying) return;
    setRetrying(true);
    try {
      const response = await api.post<{ data: RetryPaymentResponse }>(
        "/api/v1/payments/retry",
        { aggregateId },
      );
      const retry = response.data.data;
      if (!retry?.paymentUrl || !retry.txnRef) {
        throw new Error("Phản hồi retry không hợp lệ");
      }
      sessionStorage.setItem(
        PENDING_PAYMENT_STORAGE_KEY,
        JSON.stringify({
          aggregateId: retry.aggregateId,
          txnRef: retry.txnRef,
        }),
      );
      window.location.assign(retry.paymentUrl);
    } catch (error) {
      setMessage(errorMessage(error, "Không thể tạo lại phiên thanh toán"));
      setRetrying(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-20">
      <Card className="overflow-hidden border-0 text-center shadow-lg">
        <CardContent className="flex flex-col items-center gap-6 pt-12 pb-10">
          {status === "loading" && (
            <>
              <div className="h-20 w-20 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-500" />
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                Đang xác thực thanh toán...
              </h2>
              <p className="text-slate-500">{message}</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mb-2 flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-500">
                <CheckCircle2 className="h-14 w-14" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">
                Thanh toán thành công!
              </h2>
              <p className="text-lg text-slate-500">{message}</p>
              <div className="mt-6 flex w-full gap-4 px-4">
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl"
                  onClick={() => router.push("/products")}
                >
                  Mua sắm tiếp
                </Button>
                <Button
                  className="h-12 flex-1 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => router.push("/profile/orders")}
                >
                  Xem đơn hàng <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {status === "pending" && (
            <>
              <div className="mb-2 flex h-24 w-24 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <Clock3 className="h-14 w-14" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">
                Giao dịch đang được xử lý
              </h2>
              <p className="text-lg text-slate-500">{message}</p>
              <Button
                className="mt-6 h-12 w-full rounded-xl"
                onClick={() => router.push("/profile/orders")}
              >
                Theo dõi đơn hàng
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mb-2 flex h-24 w-24 items-center justify-center rounded-full bg-red-100 text-red-500">
                <XCircle className="h-14 w-14" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 dark:text-white">
                Thanh toán chưa thành công
              </h2>
              <p className="text-lg text-slate-500">{message}</p>
              <div className="mt-6 flex w-full gap-3 px-4">
                {retryAllowed && aggregateId && (
                  <Button
                    className="h-12 flex-1 rounded-xl"
                    disabled={retrying}
                    onClick={retryPayment}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {retrying ? "Đang tạo phiên..." : "Thanh toán lại"}
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="h-12 flex-1 rounded-xl"
                  onClick={() => router.push("/profile/orders")}
                >
                  Xem đơn hàng
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CheckoutCallbackPage() {
  return (
    <Suspense fallback={<div className="p-20 text-center">Đang tải...</div>}>
      <CallbackContent />
    </Suspense>
  );
}
