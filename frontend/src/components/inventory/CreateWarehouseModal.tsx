'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Building2, 
  MapPin, 
  User, 
  Boxes,
  AlertCircle,
  Search,
  Check,
  ChevronDown
} from 'lucide-react';
import { Modal } from '../ui/modal';
import { Button } from '../ui/button';
import { api } from '../../services/api';
import dynamic from 'next/dynamic';

const MapPicker = dynamic(() => import('./MapPicker'), { ssr: false });

interface CreateWarehouseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}

export function CreateWarehouseModal({ isOpen, onClose, onSubmit, isPending }: CreateWarehouseModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    description: '',
    type: 'FINISHED_GOODS',
    status: true,
    latitude: 16.047079, // Default Vietnam (Da Nang center)
    longitude: 108.206230,
    managerId: '',
    formattedAddress: '',
  });

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [mapCenter, setMapCenter] = useState<[number, number]>([16.047079, 108.206230]);
  const [addressSearch, setAddressSearch] = useState('');
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [hasPickedLocation, setHasPickedLocation] = useState(false);
  
  const [users, setUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isUserSearching, setIsUserSearching] = useState(false);
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);

  // Debounced User Search
  useEffect(() => {
    if (!isOpen || !isUserDropdownOpen) return;
    setIsUserSearching(true);
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      api.get(`/users?assignable=true&search=${encodeURIComponent(userSearch)}`, { signal: abortController.signal })
        .then(res => {
          if (Array.isArray(res.data)) setUsers(res.data);
          else if (res.data?.data) setUsers(res.data.data);
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
  }, [isOpen, isUserDropdownOpen, userSearch]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        address: '',
        description: '',
        type: 'FINISHED_GOODS',
        status: true,
        latitude: 16.047079,
        longitude: 108.206230,
        managerId: '',
        formattedAddress: '',
      });
      setTouched({});
      setAddressSearch('');
      setHasPickedLocation(false);
    }
  }, [isOpen]);

  const handleChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (!touched[field]) {
      setTouched((prev) => ({ ...prev, [field]: true }));
    }
  };

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const errors = {
    name: !formData.name.trim() ? 'Warehouse Name is required.' : '',
    address: !formData.address.trim() ? 'Address is required.' : '',
    location: !hasPickedLocation ? 'Please select warehouse location on map.' : '',
  };

  const isValid = !errors.name && !errors.address && !errors.location;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, address: true, location: true });
    
    if (isValid && !isPending) {
      onSubmit({
        name: formData.name,
        address: formData.address,
        description: formData.description,
        type: formData.type,
        latitude: Number(formData.latitude.toFixed(7)),
        longitude: Number(formData.longitude.toFixed(7)),
        managerId: formData.managerId || undefined,
        formattedAddress: formData.formattedAddress || undefined,
      });
    }
  };

  // Reverse Geocoding
  const reverseGeocode = async (lat: number, lon: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error('Network error');
      const data = await res.json();
      if (data && data.display_name) {
        setFormData(prev => ({ 
          ...prev, 
          formattedAddress: data.display_name,
          // Only overwrite user-editable address if it's empty
          address: prev.address.trim() ? prev.address : data.display_name
        }));
      }
    } catch (error) {
      console.error("Reverse geocoding failed", error);
    }
  };

  // Debounced Nominatim Search
  useEffect(() => {
    if (!addressSearch.trim() || addressSearch.length < 3) {
      setIsSearchingAddress(false);
      return;
    }
    setIsSearchingAddress(true);
    const abortController = new AbortController();
    
    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addressSearch)}`, {
          signal: abortController.signal,
          headers: {
            'Accept-Language': 'vi,en;q=0.9',
            // Nominatim requires User-Agent
            'User-Agent': 'OCOP-Vietnam-App/1.0'
          }
        });
        
        if (res.status === 429) {
          throw new Error('Rate limit exceeded (429). Please try again later.');
        }
        if (!res.ok) {
          throw new Error(`Geocoding failed with status: ${res.status}`);
        }
        
        const data = await res.json();
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          setMapCenter([lat, lon]);
          setFormData(prev => ({ 
            ...prev, 
            latitude: lat, 
            longitude: lon, 
            formattedAddress: data[0].display_name,
            address: prev.address.trim() ? prev.address : data[0].display_name
          }));
          setHasPickedLocation(true);
        } else {
          console.warn("No address found for query:", addressSearch);
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error("Geocoding failed", error);
          alert(error.message || 'Geocoding failed. Network issue or timeout.');
        }
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      abortController.abort();
    };
  }, [addressSearch]);

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
  
  const CardContainer = ({ children }: { children: React.ReactNode }) => (
    <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-xl p-5 space-y-4">
      {children}
    </div>
  );

  const filteredUsers = users.filter(u => 
    u.fullName.toLowerCase().includes(userSearch.toLowerCase()) || 
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedUser = users.find(u => u.id === formData.managerId);

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      title="Tạo kho mới (Create Warehouse)" 
      className="w-full max-w-5xl"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-h-[85vh] overflow-y-auto pr-2 pb-2 custom-scrollbar">
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT COLUMN - FORM */}
          <div className="flex flex-col gap-5">
            {/* SECTION 1: Basic Information */}
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
                        value="Auto Generated" 
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
                          {selectedUser ? `${selectedUser.fullName} (${(selectedUser as any).businesses?.[0]?.name || selectedUser.role?.name})` : 'Select a manager...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      </div>
                      
                      {isUserDropdownOpen && (
                        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
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
                                  <p className="text-xs text-slate-500">{u.email} • {(u as any).businesses?.[0]?.name || u.role?.name}</p>
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
            {isPending ? 'Creating...' : 'Create Warehouse'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
