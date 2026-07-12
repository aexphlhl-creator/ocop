'use client';

import React, { useState } from 'react';
import { useCart } from '../../../hooks/use-cart';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../stores/auth.store';
import { Button } from '../../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { MapPin, Phone, CreditCard, Banknote, ShieldCheck } from 'lucide-react';
import { api } from '../../../services/api';
import { toast } from 'sonner';
import { AddressAutocomplete } from '../../../components/ui/address-autocomplete';

export default function CheckoutPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { items, getTotalPrice, clearCart, getItemsByBusiness } = useCart();
  const [loading, setLoading] = useState(false);

  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState(user?.phone || '');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'VNPAY'>('COD');

  const [platformVoucher, setPlatformVoucher] = useState<any>(null);
  const [shopVoucher, setShopVoucher] = useState<any>(null);
  const [platformVoucherCode, setPlatformVoucherCode] = useState('');
  const [shopVoucherCode, setShopVoucherCode] = useState('');
  const [applyingVoucher, setApplyingVoucher] = useState(false);

  const totalPrice = getTotalPrice();
  const itemsByBusiness = getItemsByBusiness();

  // If cart is empty, redirect
  if (items.length === 0 && !loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4">Giỏ hàng của bạn đang trống</h2>
        <Button onClick={() => router.push('/products')}>Mua sắm ngay</Button>
      </div>
    );
  }

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Vui lòng đăng nhập để tiếp tục thanh toán');
      router.push('/login?redirect=/checkout');
      return;
    }

    if (!address || !phone) {
      toast.error('Vui lòng nhập đầy đủ thông tin giao hàng');
      return;
    }

    setLoading(true);

    try {
      // Vì hệ thống OCOP có nhiều chủ thể (Business), lý tưởng nhất là tách thành nhiều Order 
      // cho mỗi Business. Ở bản MVP này, ta sẽ tạo order lần lượt cho từng Business.
      const businesses = Object.keys(itemsByBusiness);
      let firstOrderId = '';
      
      for (let i = 0; i < businesses.length; i++) {
        const businessId = businesses[i];
        const businessItems = itemsByBusiness[businessId];
        
        const payload = {
          businessId,
          shippingAddress: address,
          phone,
          paymentMethod,
          items: businessItems.map(item => ({
            productId: item.id,
            quantity: item.quantity,
          })),
          platformVoucherCode: platformVoucher?.code,
          shopVoucherCode: shopVoucher?.code,
        };

        const res = await api.post('/api/v1/orders', payload);
        if (i === 0) firstOrderId = res.data.data.id;
      }

      clearCart();

      // Xử lý VNPay (Chỉ hỗ trợ thanh toán tổng cho Order đầu tiên trong bản MVP để demo)
      if (paymentMethod === 'VNPAY' && firstOrderId) {
        toast.info('Đang chuyển hướng sang VNPay...');
        const vnpayRes = await api.post('/api/v1/payments/create-url', {
          orderId: firstOrderId,
          amount: totalPrice,
        });
        window.location.href = vnpayRes.data.data.paymentUrl;
      } else {
        toast.success('Đặt hàng thành công!');
        router.push('/dashboard/orders'); // Assuming user has an orders page, or just /products
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Có lỗi xảy ra khi đặt hàng');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white mb-8">
        Thanh toán đơn hàng
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Form Info */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MapPin className="h-5 w-5 text-emerald-600" /> Thông tin giao hàng
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="phone" className="text-sm font-medium leading-none text-slate-900 dark:text-white">Số điện thoại liên hệ</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input 
                    id="phone" 
                    value={phone} 
                    onChange={(e) => setPhone(e.target.value)} 
                    placeholder="Nhập số điện thoại" 
                    className="pl-9"
                    required 
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="address" className="text-sm font-medium leading-none text-slate-900 dark:text-white">Địa chỉ nhận hàng chi tiết</label>
                <AddressAutocomplete 
                  value={address} 
                  onChange={setAddress} 
                  placeholder="Nhập địa chỉ giao hàng để tìm kiếm..." 
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <CreditCard className="h-5 w-5 text-emerald-600" /> Phương thức thanh toán
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${paymentMethod === 'COD' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                <input 
                  type="radio" 
                  name="payment" 
                  value="COD" 
                  checked={paymentMethod === 'COD'} 
                  onChange={() => setPaymentMethod('COD')} 
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-600"
                />
                <Banknote className={`h-6 w-6 ${paymentMethod === 'COD' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 dark:text-white">Thanh toán khi nhận hàng (COD)</span>
                  <span className="text-sm text-slate-500">Thanh toán bằng tiền mặt khi đơn hàng được giao đến</span>
                </div>
              </label>

              <label className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-colors ${paymentMethod === 'VNPAY' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'border-slate-200 dark:border-slate-800'}`}>
                <input 
                  type="radio" 
                  name="payment" 
                  value="VNPAY" 
                  checked={paymentMethod === 'VNPAY'} 
                  onChange={() => setPaymentMethod('VNPAY')} 
                  className="w-4 h-4 text-emerald-600 focus:ring-emerald-600"
                />
                <ShieldCheck className={`h-6 w-6 ${paymentMethod === 'VNPAY' ? 'text-emerald-600' : 'text-slate-400'}`} />
                <div className="flex flex-col">
                  <span className="font-bold text-slate-900 dark:text-white">Thanh toán trực tuyến (VNPay)</span>
                  <span className="text-sm text-slate-500">Thanh toán an toàn qua thẻ ATM, Visa, MasterCard hoặc Ví VNPay</span>
                </div>
              </label>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-5">
          <Card className="sticky top-24">
            <CardHeader className="bg-slate-50 dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 rounded-t-xl">
              <CardTitle className="text-lg font-bold">Tóm tắt đơn hàng</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="max-h-[300px] overflow-y-auto pr-2 flex flex-col gap-4">
                {items.map((item) => (
                  <div key={item.id} className="flex gap-3">
                    <div className="h-16 w-16 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200 dark:border-slate-800">
                      <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 flex flex-col justify-between">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white line-clamp-2">{item.name}</h4>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-slate-500">Số lượng: {item.quantity}</span>
                        <span className="font-bold text-sm text-emerald-600">{(item.price * item.quantity).toLocaleString('vi-VN')} đ</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 my-2" />

              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <Input 
                    placeholder="Nhập mã giảm giá sàn" 
                    value={platformVoucherCode} 
                    onChange={e => setPlatformVoucherCode(e.target.value)} 
                    disabled={!!platformVoucher}
                  />
                  {!platformVoucher ? (
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        if (!platformVoucherCode) return;
                        setApplyingVoucher(true);
                        try {
                          // Simple MVP: use the first businessId in cart
                          const businessId = Object.keys(itemsByBusiness)[0];
                          const res = await api.post('/api/v1/vouchers/apply', {
                            code: platformVoucherCode,
                            businessId,
                            orderValue: totalPrice
                          });
                          if (res.data.data.type !== 'PLATFORM') {
                            toast.error('Đây không phải là mã của sàn');
                            return;
                          }
                          setPlatformVoucher(res.data.data);
                          toast.success('Áp dụng mã sàn thành công');
                        } catch (err: any) {
                          toast.error(err.response?.data?.message || 'Mã không hợp lệ');
                        } finally {
                          setApplyingVoucher(false);
                        }
                      }}
                      disabled={applyingVoucher}
                    >
                      Áp dụng
                    </Button>
                  ) : (
                    <Button variant="outline" className="text-red-500 border-red-500" onClick={() => { setPlatformVoucher(null); setPlatformVoucherCode(''); }}>Hủy mã</Button>
                  )}
                </div>

                <div className="flex gap-2">
                  <Input 
                    placeholder="Nhập mã giảm giá của shop" 
                    value={shopVoucherCode} 
                    onChange={e => setShopVoucherCode(e.target.value)} 
                    disabled={!!shopVoucher}
                  />
                  {!shopVoucher ? (
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        if (!shopVoucherCode) return;
                        setApplyingVoucher(true);
                        try {
                          const businessId = Object.keys(itemsByBusiness)[0];
                          const res = await api.post('/api/v1/vouchers/apply', {
                            code: shopVoucherCode,
                            businessId,
                            orderValue: totalPrice
                          });
                          if (res.data.data.type !== 'SHOP') {
                            toast.error('Đây không phải là mã của shop');
                            return;
                          }
                          setShopVoucher(res.data.data);
                          toast.success('Áp dụng mã shop thành công');
                        } catch (err: any) {
                          toast.error(err.response?.data?.message || 'Mã không hợp lệ');
                        } finally {
                          setApplyingVoucher(false);
                        }
                      }}
                      disabled={applyingVoucher}
                    >
                      Áp dụng
                    </Button>
                  ) : (
                    <Button variant="outline" className="text-red-500 border-red-500" onClick={() => { setShopVoucher(null); setShopVoucherCode(''); }}>Hủy mã</Button>
                  )}
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 my-2" />

              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Tạm tính ({items.length} sản phẩm)</span>
                <span className="font-bold">{totalPrice.toLocaleString('vi-VN')} đ</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500">Phí vận chuyển</span>
                <span className="font-bold text-emerald-600">Miễn phí</span>
              </div>

              {platformVoucher && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Giảm giá sàn ({platformVoucher.code})</span>
                  <span className="font-bold text-red-500">- {platformVoucher.discountAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              )}
              {shopVoucher && (
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-500">Giảm giá shop ({shopVoucher.code})</span>
                  <span className="font-bold text-red-500">- {shopVoucher.discountAmount.toLocaleString('vi-VN')} đ</span>
                </div>
              )}

              <div className="border-t border-slate-200 dark:border-slate-800 my-2" />

              <div className="flex justify-between items-center mb-4">
                <span className="text-base font-bold text-slate-900 dark:text-white">Tổng cộng</span>
                <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                  {Math.max(0, totalPrice - (platformVoucher?.discountAmount || 0) - (shopVoucher?.discountAmount || 0)).toLocaleString('vi-VN')} đ
                </span>
              </div>

              <Button 
                onClick={handleCheckout} 
                disabled={loading}
                className="w-full h-12 text-base font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
              >
                {loading ? 'Đang xử lý...' : 'Xác nhận đặt hàng'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
