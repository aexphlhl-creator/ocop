'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Building2, 
  MapPin, 
  User, 
  Boxes,
  AlertCircle,
  Search,
  Check,
  ChevronDown,
  UserPlus,
} from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { api } from '../../services/api';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

interface CreateWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: WarehouseFormPayload) => void;
  isPending: boolean;
  initialData?: WarehouseModalData | null;
}

export interface WarehouseFormPayload {
  sellerId?: string;
  name: string;
  address: string;
  description?: string;
  type: string;
  latitude?: number;
  longitude?: number;
  managerId?: string | null;
  formattedAddress?: string;
}

interface WarehouseModalData {
  sellerId?: string | null;
  seller?: {
    id: string;
    fullName?: string | null;
    email?: string | null;
    sellerProfile?: {
      displayName?: string | null;
      isVerified?: boolean | null;
    } | null;
  } | null;
  code: string;
  name: string;
  address: string;
  formattedAddress?: string | null;
  description?: string | null;
  type: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  manager?: ManagerUser | null;
  _count?: {
    inventories?: number;
    purchaseOrders?: number;
    goodsReceipts?: number;
    outboundShipments?: number;
    inboundShipments?: number;
  };
}

interface ManagerUser {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role?: { name: string };
  sellerProfile?: { displayName: string } | null;
}

interface SellerOption {
  sellerId: string;
  name: string;
  isVerified?: boolean;
}

interface WarehouseFormState {
  name: string;
  address: string;
  description: string;
  type: string;
  status: boolean;
  latitude: number;
  longitude: number;
  managerId: string;
  sellerId: string;
  formattedAddress: string;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  display_name?: string;
  name?: string;
}

interface AdminAreaLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  province?: {
    name?: string;
  };
}

interface ApiErrorResponse {
  response?: {
    data?: {
      message?: unknown;
    };
  };
}

const EMPTY_MANAGER_FORM = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
};

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function CardContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-xl p-5 space-y-4">
      {children}
    </div>
  );
}

export function CreateWarehouseModal(props: CreateWarehouseModalProps) {
  if (!props.isOpen) return null;
  return <WarehouseForm key={props.initialData?.code ?? 'new'} {...props} />;
}

function WarehouseForm({
  isOpen,
  onClose,
  onSubmit,
  isPending,
  initialData,
}: CreateWarehouseModalProps) {
  const isEditing = Boolean(initialData);
  const hasWarehouseOperations = Boolean(
    initialData?._count &&
      ((initialData._count.inventories ?? 0) > 0 ||
        (initialData._count.purchaseOrders ?? 0) > 0 ||
        (initialData._count.goodsReceipts ?? 0) > 0 ||
        (initialData._count.outboundShipments ?? 0) > 0 ||
        (initialData._count.inboundShipments ?? 0) > 0),
  );
  const isSellerOwnerLocked = Boolean(
    isEditing && initialData?.sellerId && hasWarehouseOperations,
  );
  const sellersQuery = useQuery({
    queryKey: ['warehouse-seller-options'],
    enabled: isOpen,
    queryFn: async () => {
      const sellers: SellerOption[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const response = await api.get('/api/v1/seller-profiles', { params: { verified: true, limit: 100, page } });
        sellers.push(...(response.data.data ?? []));
        totalPages = response.data.meta?.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages);
      return sellers;
    },
  });
  const provincesQuery = useQuery<AdminAreaLocation[]>({
    queryKey: ['warehouse-address-provinces'],
    enabled: isOpen,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const response = await api.get('/api/v1/provinces');
      return response.data.data ?? [];
    },
  });
  const initialLatitude = Number(initialData?.latitude);
  const initialLongitude = Number(initialData?.longitude);
  const hasInitialCoordinates = initialData?.latitude != null && initialData?.longitude != null &&
    Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude);
  const latitude = hasInitialCoordinates ? initialLatitude : 16.047079;
  const longitude = hasInitialCoordinates ? initialLongitude : 108.20623;
  const [formData, setFormData] = useState<WarehouseFormState>({
    name: initialData?.name ?? '',
    address: initialData?.address ?? '',
    description: initialData?.description ?? '',
    type: initialData?.type ?? 'FINISHED_GOODS',
    status: true,
    latitude,
    longitude,
    managerId: initialData?.manager?.id ?? '',
    sellerId: initialData?.sellerId ?? '',
    formattedAddress: initialData?.formattedAddress ?? '',
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [mapCenter, setMapCenter] = useState<[number, number]>([latitude, longitude]);
  const [addressSearch, setAddressSearch] = useState('');
  const [addressSearchError, setAddressSearchError] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [hasPickedLocation, setHasPickedLocation] = useState(hasInitialCoordinates);
  
  const [users, setUsers] = useState<ManagerUser[]>(initialData?.manager ? [initialData.manager] : []);
  const [userSearch, setUserSearch] = useState('');
  const [isUserSearching, setIsUserSearching] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const [isCreateManagerOpen, setIsCreateManagerOpen] = useState(false);
  const [isCreatingManager, setIsCreatingManager] = useState(false);
  const [managerForm, setManagerForm] = useState(EMPTY_MANAGER_FORM);
  const [managerFormError, setManagerFormError] = useState('');

  // Debounced User Search
  useEffect(() => {
    if (!isOpen || !isUserDropdownOpen) return;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      setIsUserSearching(true);
      api.get(`/api/v1/users?assignable=true&search=${encodeURIComponent(userSearch)}`, { signal: abortController.signal })
        .then(res => {
          const payload = res.data?.data ?? res.data;
          const managerList = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
              ? payload.data
              : [];
          setUsers((current) => {
            const selectedManager = initialData?.manager
              ? current.find((manager) => manager.id === initialData.manager?.id) ??
                initialData.manager
              : undefined;
            const results = managerList as ManagerUser[];
            return selectedManager && !results.some((manager) => manager.id === selectedManager.id)
              ? [selectedManager, ...results]
              : results;
          });
        })
        .catch(err => {
          if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
            console.error("Failed to fetch assignable users", err);
          }
        })
        .finally(() => setIsUserSearching(false));
    }, 400);

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [initialData?.manager, isOpen, isUserDropdownOpen, userSearch]);

  const handleChange = <K extends keyof WarehouseFormState>(
    field: K,
    value: WarehouseFormState[K],
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (!touched[field]) {
      setTouched((prev) => ({ ...prev, [field]: true }));
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleCreateManager = async () => {
    const fullName = managerForm.fullName.trim();
    const email = managerForm.email.trim().toLowerCase();
    const password = managerForm.password;

    if (!fullName || !email || !password) {
      setManagerFormError('Vui lòng nhập họ tên, email và mật khẩu.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setManagerFormError('Email không hợp lệ.');
      return;
    }
    if (
      password.length < 8 ||
      !/[a-z]/.test(password) ||
      !/[A-Z]/.test(password) ||
      !/\d/.test(password)
    ) {
      setManagerFormError(
        'Mật khẩu cần ít nhất 8 ký tự, có chữ hoa, chữ thường và chữ số.',
      );
      return;
    }

    setIsCreatingManager(true);
    setManagerFormError('');
    try {
      const response = await api.post('/api/v1/users/warehouse-managers', {
        fullName,
        email,
        phone: managerForm.phone.trim() || undefined,
        password,
      });
      const createdManager = (response.data?.data ?? response.data) as ManagerUser;
      setUsers((current) => [
        createdManager,
        ...current.filter((manager) => manager.id !== createdManager.id),
      ]);
      handleChange('managerId', createdManager.id);
      setManagerForm(EMPTY_MANAGER_FORM);
      setIsCreateManagerOpen(false);
      setIsUserDropdownOpen(false);
      setUserSearch('');
    } catch (error: unknown) {
      const apiError = error as ApiErrorResponse;
      const message =
        typeof apiError.response?.data?.message === 'string'
          ? apiError.response.data.message
          : 'Không thể tạo tài khoản quản lý kho.';
      setManagerFormError(message);
    } finally {
      setIsCreatingManager(false);
    }
  };

  const errors = {
    sellerId: !formData.sellerId ? 'Vui lòng chọn Seller sở hữu kho.' : '',
    name: !formData.name.trim() ? 'Warehouse Name is required.' : '',
    address: !formData.address.trim() ? 'Address is required.' : '',
    location:
      !isEditing && !hasPickedLocation
        ? 'Please select warehouse location on map.'
        : '',
  };

  const isValid = !errors.sellerId && !errors.name && !errors.address && !errors.location;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ sellerId: true, name: true, address: true, location: true });
    
    if (isValid && !isPending) {
      onSubmit({
        name: formData.name,
        sellerId: formData.sellerId,
        address: formData.address,
        description: formData.description,
        type: formData.type,
        ...(hasPickedLocation
          ? {
              latitude: Number(formData.latitude.toFixed(7)),
              longitude: Number(formData.longitude.toFixed(7)),
            }
          : {}),
        managerId: formData.managerId || (isEditing ? null : undefined),
        formattedAddress: formData.formattedAddress || undefined,
      });
    }
  };

  // Reverse Geocoding
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`, {
        headers: { 'Accept-Language': 'vi,en;q=0.9' },
      });
      if (!res.ok) throw new Error('Network error');
      const data = (await res.json()) as { display_name?: string };
      if (data && data.display_name) {
        const displayName = data.display_name;
        setFormData(prev => ({ 
          ...prev, 
          formattedAddress: displayName,
          // Only overwrite user-editable address if it's empty
          address: prev.address.trim() ? prev.address : displayName,
        }));
      }
    } catch (error) {
      console.error("Reverse geocoding failed", error);
    }
  };

  const applyGeocodeResult = (result: {
    latitude: number;
    longitude: number;
    displayName: string;
  }) => {
    setMapCenter([result.latitude, result.longitude]);
    setFormData(prev => ({
      ...prev,
      latitude: result.latitude,
      longitude: result.longitude,
      formattedAddress: result.displayName,
      address: prev.address.trim() ? prev.address : result.displayName,
    }));
    setHasPickedLocation(true);
    setAddressSearchError('');
  };

  const findLocalAdminArea = useCallback(async (
    query: string,
    signal: AbortSignal,
  ): Promise<{ latitude: number; longitude: number; displayName: string } | null> => {
    const normalizedQuery = normalizeSearchText(query);
    if (!normalizedQuery) return null;

    const provinces =
      provincesQuery.data ??
      ((await api.get('/api/v1/provinces', { signal })).data.data as AdminAreaLocation[] | undefined) ??
      [];

    const rankedProvince = provinces
      .map((province) => {
        const normalizedName = normalizeSearchText(province.name);
        const score =
          normalizedName === normalizedQuery
            ? 3
            : normalizedName.startsWith(normalizedQuery) ||
                normalizedQuery.startsWith(normalizedName)
              ? 2
              : normalizedName.includes(normalizedQuery) ||
                  normalizedQuery.includes(normalizedName)
                ? 1
                : 0;
        return { province, score };
      })
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)[0];

    if (rankedProvince) {
      return {
        latitude: Number(rankedProvince.province.latitude),
        longitude: Number(rankedProvince.province.longitude),
        displayName: `${rankedProvince.province.name}, Việt Nam`,
      };
    }

    try {
      const wardsResponse = await api.get('/api/v1/wards', {
        params: { search: query, limit: 10 },
        signal,
      });
      const wards = (wardsResponse.data.data ?? []) as AdminAreaLocation[];
      const ward = wards[0];
      if (ward) {
        return {
          latitude: Number(ward.latitude),
          longitude: Number(ward.longitude),
          displayName: `${ward.name}${ward.province?.name ? `, ${ward.province.name}` : ''}, Việt Nam`,
        };
      }
    } catch (error: unknown) {
      const isCanceled =
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name?: string }).name === 'CanceledError';
      if (!isCanceled) {
        console.warn('Local admin-area geocode fallback failed', error);
      }
    }

    return null;
  }, [provincesQuery.data]);

  const findExternalAddress = async (
    query: string,
    signal: AbortSignal,
  ): Promise<{ latitude: number; longitude: number; displayName: string } | null> => {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&countrycodes=vn&limit=5&q=${encodeURIComponent(query)}`,
      {
        signal,
        headers: { 'Accept-Language': 'vi,en;q=0.9' },
      },
    );

    if (res.status === 429) {
      throw new Error('Dịch vụ bản đồ đang giới hạn truy cập, vui lòng thử lại sau.');
    }
    if (!res.ok) {
      throw new Error(`Dịch vụ bản đồ trả về lỗi ${res.status}.`);
    }

    const data = (await res.json()) as NominatimPlace[];
    const place = data[0];
    if (!place) return null;

    return {
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
      displayName: place.display_name || place.name || query,
    };
  };

  // Debounced Nominatim Search
  useEffect(() => {
    if (!addressSearch.trim() || addressSearch.length < 3) {
      return;
    }
    const abortController = new AbortController();
    
    const timeoutId = setTimeout(async () => {
      setIsSearchingAddress(true);
      setAddressSearchError('');
      try {
        const localResult = await findLocalAdminArea(
          addressSearch,
          abortController.signal,
        );
        if (localResult) {
          applyGeocodeResult(localResult);
          return;
        }

        const externalResult = await findExternalAddress(
          addressSearch,
          abortController.signal,
        );
        if (externalResult) {
          applyGeocodeResult(externalResult);
        } else {
          setAddressSearchError(
            'Không tìm thấy địa chỉ này. Bạn có thể nhập địa chỉ thủ công hoặc kéo marker trên bản đồ.',
          );
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error("Geocoding failed", error);
          setAddressSearchError(
            error.message === 'Failed to fetch'
              ? 'Không kết nối được dịch vụ bản đồ bên ngoài. Bạn vẫn có thể nhập địa chỉ thủ công hoặc kéo marker.'
              : error.message,
          );
        }
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [addressSearch, findLocalAdminArea]);

  const handleMarkerDragEnd = (lat: number, lng: number) => {
    setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
    setHasPickedLocation(true);
    reverseGeocode(lat, lng);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = position.coords.latitude;
      const lon = position.coords.longitude;
      setMapCenter([lat, lon]);
      setFormData(prev => ({ ...prev, latitude: lat, longitude: lon }));
      setHasPickedLocation(true);
      reverseGeocode(lat, lon);
    }, () => {
      alert("Unable to retrieve your location");
    });
  };

  // Common input styles
  const baseInputCls = "w-full border rounded-lg px-3 py-2 text-sm text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent";
  const getErrorCls = (fieldError: string, fieldTouched: boolean) => {
    return fieldError && fieldTouched ? "border-red-500 ring-1 ring-red-500" : "border-slate-200 dark:border-slate-700";
  };
  const labelCls = "block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center gap-1.5";
  
  const filteredUsers = users.filter(u =>
    u.fullName.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === formData.managerId);
  const currentSeller = initialData?.seller;
  const sellerOptions =
    initialData?.sellerId &&
    currentSeller &&
    !(sellersQuery.data ?? []).some((seller) => seller.sellerId === initialData.sellerId)
      ? [
          {
            sellerId: initialData.sellerId,
            name:
              currentSeller.sellerProfile?.displayName ||
              currentSeller.fullName ||
              currentSeller.email ||
              'Seller hiện tại',
            isVerified: Boolean(currentSeller.sellerProfile?.isVerified),
          },
          ...(sellersQuery.data ?? []),
        ]
      : (sellersQuery.data ?? []);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title={isEditing ? 'Chỉnh sửa kho (Edit Warehouse)' : 'Tạo kho mới (Create Warehouse)'}
      className="w-full max-w-5xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-h-[85vh] overflow-y-auto pr-2 pb-2 custom-scrollbar">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN - FORM */}
          <div className="flex flex-col gap-5">
            {/* SECTION 1: Basic Information */}
            <label className="block text-sm font-semibold">
              Seller sở hữu kho *
              <select
                required
                disabled={isSellerOwnerLocked}
                className={`mt-2 w-full rounded-xl border p-3 ${getErrorCls(errors.sellerId, touched.sellerId)} ${
                  isSellerOwnerLocked
                    ? 'cursor-not-allowed bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-transparent'
                }`}
                value={formData.sellerId}
                onChange={(e) => handleChange('sellerId', e.target.value)}
                onBlur={() => handleBlur('sellerId')}
              >
                <option value="">Chọn Seller đã xác minh</option>
                {sellerOptions.map((seller) => <option key={seller.sellerId} value={seller.sellerId}>{seller.name}</option>)}
              </select>
              {errors.sellerId && touched.sellerId && <p className="mt-1 text-xs text-red-500">{errors.sellerId}</p>}
              {sellersQuery.isPending && <span role="status" className="mt-1 block text-xs text-slate-500">Đang tải Seller…</span>}
              {sellersQuery.isError && <span role="alert" className="mt-1 block text-xs text-red-500">Không tải được danh sách Seller. Vui lòng mở lại form.</span>}
              {sellersQuery.isSuccess && !sellerOptions.length && <span className="mt-1 block text-xs text-amber-600">Chưa có Seller đã xác minh. Tạo và xác minh tại Quản lý Seller trước.</span>}
              {isSellerOwnerLocked ? (
                <span className="mt-1 block text-xs font-semibold text-amber-600">
                  Seller sở hữu đã khóa vì kho đã phát sinh tồn kho/lô hàng/đơn vận hành. Bạn vẫn có thể sửa tên, loại kho, quản lý, mô tả và địa chỉ.
                </span>
              ) : isEditing ? (
                <span className="mt-1 block text-xs text-slate-500">
                  Chỉ nên đổi Seller khi kho chưa phát sinh dữ liệu vận hành, để bảo toàn truy xuất nguồn gốc.
                </span>
              ) : null}
            </label>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-600" /> Basic Information
              </h4>
              <CardContainer>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={labelCls}>Warehouse Name <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <input 
                        value={formData.name} 
                        onChange={e => handleChange('name', e.target.value)}
                        onBlur={() => handleBlur('name')}
                        className={`${baseInputCls} ${getErrorCls(errors.name, touched.name)} pr-10`} 
                        placeholder="Enter warehouse name..." 
                      />
                      {errors.name && touched.name && (
                        <AlertCircle className="w-4 h-4 text-red-500 absolute right-3 top-2.5" />
                      )}
                    </div>
                    {errors.name && touched.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className={labelCls}>Warehouse Type</label>
                      <div className="relative">
                        <Boxes className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                        <select 
                          value={formData.type} 
                          onChange={e => handleChange('type', e.target.value)}
                          className={`${baseInputCls} pl-9 border-slate-200 dark:border-slate-700`}
                        >
                          <option value="FINISHED_GOODS">Finished Goods</option>
                          <option value="RAW_MATERIAL">Raw Materials</option>
                          <option value="WORK_IN_PROGRESS">Work In Progress</option>
                          <option value="COLD_STORAGE">Cold Storage</option>
                          <option value="DISTRIBUTION_CENTER">Distribution Center</option>
                          <option value="TRANSIT">Transit Warehouse</option>
                          <option value="OTHER">Other</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className={labelCls}>Warehouse Code</label>
                      <input 
                        value={initialData?.code ?? 'Auto Generated'}
                        disabled
                        className={`${baseInputCls} bg-slate-100/50 dark:bg-slate-800/50 cursor-not-allowed text-slate-500 text-center`}
                      />
                    </div>
                  </div>
                </div>
              </CardContainer>
            </div>

            {/* SECTION 2: Manager & Description */}
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" /> Manager & Details
              </h4>
              <CardContainer>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={labelCls}>Assign Manager</label>
                    <div className="relative">
                      <div 
                        className={`${baseInputCls} border-slate-200 dark:border-slate-700 cursor-pointer flex justify-between items-center`}
                        onClick={() => setIsUserDropdownOpen(!isUserDropdownOpen)}
                      >
                        <span className={selectedUser ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}>
                          {selectedUser ? `${selectedUser.fullName} (${selectedUser.sellerProfile?.displayName || selectedUser.role?.name})` : 'Select a manager...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </div>
                      
                      {isUserDropdownOpen && (
                        <div className="absolute z-50 w-full max-h-[60vh] mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-y-auto custom-scrollbar">
                          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                            <div className="relative">
                              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
                              <input 
                                value={userSearch}
                                onChange={e => setUserSearch(e.target.value)}
                                className="w-full pl-8 pr-8 py-1.5 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                placeholder="Search manager..."
                                autoFocus
                              />
                              {isUserSearching && (
                                <div className="absolute right-2.5 top-2">
                                  <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                            <button
                              type="button"
                              onClick={() => {
                                setIsCreateManagerOpen((open) => !open);
                                setManagerFormError('');
                              }}
                              className="w-full flex items-center justify-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                              <UserPlus className="w-4 h-4" />
                              {isCreateManagerOpen
                                ? 'Đóng form tạo tài khoản'
                                : 'Tạo tài khoản quản lý kho'}
                            </button>

                            {isCreateManagerOpen && (
                              <div
                                className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    void handleCreateManager();
                                  }
                                }}
                              >
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                  Tài khoản Warehouse Manager
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    value={managerForm.fullName}
                                    onChange={(event) =>
                                      setManagerForm((current) => ({
                                        ...current,
                                        fullName: event.target.value,
                                      }))
                                    }
                                    className={baseInputCls}
                                    placeholder="Họ và tên *"
                                    autoComplete="section-warehouse-manager name"
                                  />
                                  <input
                                    type="email"
                                    value={managerForm.email}
                                    onChange={(event) =>
                                      setManagerForm((current) => ({
                                        ...current,
                                        email: event.target.value,
                                      }))
                                    }
                                    className={baseInputCls}
                                    placeholder="Email đăng nhập *"
                                    autoComplete="section-warehouse-manager email"
                                  />
                                  <input
                                    value={managerForm.phone}
                                    onChange={(event) =>
                                      setManagerForm((current) => ({
                                        ...current,
                                        phone: event.target.value,
                                      }))
                                    }
                                    className={baseInputCls}
                                    placeholder="Số điện thoại"
                                    autoComplete="section-warehouse-manager tel"
                                  />
                                  <input
                                    type="password"
                                    value={managerForm.password}
                                    onChange={(event) =>
                                      setManagerForm((current) => ({
                                        ...current,
                                        password: event.target.value,
                                      }))
                                    }
                                    className={baseInputCls}
                                    placeholder="Mật khẩu tạm thời *"
                                    autoComplete="section-warehouse-manager new-password"
                                  />
                                </div>
                                <p className="text-[10px] text-slate-500">
                                  Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và chữ số.
                                </p>
                                {managerFormError && (
                                  <p className="text-xs text-red-500">
                                    {managerFormError}
                                  </p>
                                )}
                                <div className="flex justify-end gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setIsCreateManagerOpen(false);
                                      setManagerFormError('');
                                    }}
                                    disabled={isCreatingManager}
                                  >
                                    Hủy
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    onClick={handleCreateManager}
                                    isLoading={isCreatingManager}
                                    disabled={isCreatingManager}
                                  >
                                    Tạo và chọn
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                          <ul className="max-h-48 overflow-y-auto py-1 custom-scrollbar">
                            <li 
                              className="px-3 py-2 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
                              onClick={() => {
                                handleChange('managerId', '');
                                setIsUserDropdownOpen(false);
                              }}
                            >
                              -- Unassigned --
                            </li>
                            {filteredUsers.map(u => (
                              <li 
                                key={u.id}
                                className="px-3 py-2 text-sm text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer flex items-center justify-between"
                                onClick={() => {
                                  handleChange('managerId', u.id);
                                  setIsUserDropdownOpen(false);
                                  setUserSearch('');
                                }}
                              >
                                <div>
                                  <p className="font-medium">{u.fullName}</p>
                                  <p className="text-xs text-slate-500">{u.email} • {u.sellerProfile?.displayName || u.role?.name}</p>
                                </div>
                                {formData.managerId === u.id && <Check className="w-4 h-4 text-emerald-600" />}
                              </li>
                            ))}
                            {filteredUsers.length === 0 && (
                              <li className="px-3 py-3 text-sm text-slate-500 text-center">No assignable managers found.</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Description</label>
                    <textarea 
                      rows={2} 
                      value={formData.description} 
                      onChange={e => handleChange('description', e.target.value)} 
                      className={`${baseInputCls} border-slate-200 dark:border-slate-700 resize-none`} 
                      placeholder="Warehouse description, storage conditions..." 
                    />
                  </div>
                </div>
              </CardContainer>
            </div>
          </div>

          {/* RIGHT COLUMN - MAP & LOCATION */}
          <div className="flex flex-col gap-5 h-full">
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-600" /> Location (Map Picker)
                </div>
                <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation} className="text-xs py-1 h-auto">
                  Use Current Location
                </Button>
              </h4>
              <CardContainer>
                <div className="grid grid-cols-1 gap-4">
                  
                  {/* Address Search */}
                  <div>
                    <label className={labelCls}>Search Address (Auto-Search)</label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input 
                        value={addressSearch} 
                        onChange={e => setAddressSearch(e.target.value)}
                        className={`${baseInputCls} pl-9 pr-10 border-slate-200 dark:border-slate-700`} 
                        placeholder="Search city, district, street... (min 3 chars)" 
                      />
                      {isSearchingAddress && (
                        <div className="absolute right-3 top-2.5">
                          <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                    </div>
                    {addressSearchError && (
                      <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">
                        {addressSearchError}
                      </p>
                    )}
                  </div>

                  {/* Map */}
                  <div className={`relative h-[350px] w-full rounded-xl overflow-hidden border ${errors.location && touched.location ? 'border-red-500' : 'border-slate-200 dark:border-slate-700'}`}>
                    <MapPicker 
                      center={mapCenter} 
                      markerPosition={[formData.latitude, formData.longitude]} 
                      onMarkerDragEnd={handleMarkerDragEnd} 
                    />
                    {!hasPickedLocation && (
                      <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center backdrop-blur-sm pointer-events-none">
                        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-600 animate-bounce" />
                          Drag marker or search to set location
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.location && touched.location && <p className="text-xs text-red-500 -mt-2">{errors.location}</p>}

                  {/* Final Address (Editable) */}
                  <div>
                    <label className={labelCls}>User-Editable Address <span className="text-red-500">*</span></label>
                    <input 
                      value={formData.address} 
                      onChange={e => handleChange('address', e.target.value)}
                      onBlur={() => handleBlur('address')}
                      className={`${baseInputCls} ${getErrorCls(errors.address, touched.address)}`} 
                      placeholder="e.g. Building A, Floor 2..." 
                    />
                    {errors.address && touched.address && <p className="text-xs text-red-500 mt-1">{errors.address}</p>}
                  </div>

                  {/* Formatted Address (Read-only from Reverse Geocoding) */}
                  {formData.formattedAddress && (
                    <div>
                      <label className={labelCls}>Formatted Location Preview</label>
                      <div className="p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-xs text-slate-500">
                        {formData.formattedAddress}
                      </div>
                    </div>
                  )}

                  {hasPickedLocation && (
                    <p className="text-[10px] text-slate-500 mt-1 font-mono">
                      GPS: {formData.latitude.toFixed(7)}, {formData.longitude.toFixed(7)}
                    </p>
                  )}
                </div>
              </CardContainer>
            </div>
          </div>

        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-3 pt-5 border-t border-slate-100 dark:border-slate-800 mt-2 sticky bottom-0 bg-white dark:bg-slate-900 pb-2 z-10">
          <Button 
            type="button" 
            variant="outline" 
            onClick={onClose}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="primary" 
            isLoading={isPending}
            disabled={!isValid || isPending}
            className="w-full sm:w-auto min-w-[160px] bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isPending
              ? isEditing
                ? 'Đang lưu...'
                : 'Creating...'
              : isEditing
                ? 'Lưu thay đổi'
                : 'Create Warehouse'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
