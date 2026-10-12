// Subset of the backend order DTO the app reads (web src/types/order.ts).
export interface OrderItem {
  id: number;
  name: string;
  itemCount: number;
  itemPrice?: number;
}

export interface DeliveryPartnerDetails {
  id?: string;
  name?: string;
  mobileNumber?: number | string;
}

// Shop profile as it rides along inside every order (there is no separate profile endpoint).
export interface ShopDetails {
  shopId?: string | number;
  name?: string;
  logo?: string;
  owner?: string;
  phone?: string | number;
  openingTime?: string;
  closingTime?: string;
  description?: string;
  category?: string;
  address?: { address?: string; city?: string; state?: string; postalCode?: string } | null;
}

export interface OrderFinance {
  commission?: number;
  commissionRate?: number;
}

export interface Order {
  orderId: string;
  shopId?: number | string;
  customerName?: string;
  customerMobile?: number | string;
  state?: string;
  status?: string;
  creationTime?: string;
  acceptedDate?: string | null;
  readyDate?: string | null;
  completedDate?: string | null;
  rejectedDate?: string | null;
  isSettled?: boolean;
  finance?: OrderFinance | null;
  preparationTime?: number;
  orderItem?: OrderItem[];
  amountExcludingDeliveryFee?: number;
  totalAmount?: number;
  deliveryFee?: number;
  totalItemCount?: number;
  orderDescription?: string;
  customerAddress?: unknown;
  stateLabel?: string;
  shopDetails?: ShopDetails | null;
  paymentMethod?: string;
  deliveryPartnerDetails?: DeliveryPartnerDetails | null;
  assignedPartner?: { orderStatus?: string; OrderStatus?: string; [key: string]: unknown } | null;
}

export type OrderPhase = 'PENDING' | 'ACCEPTED' | 'READY_FOR_PICKUP';

// Order History filters (web src/types/filters.ts).
export type HistoryStatus = 'COMPLETED' | 'IN_TRANSIT' | 'REJECTED' | 'CANCELLED' | 'PENDING' | 'ACCEPTED' | 'READY_FOR_PICKUP';
export type TimeRange = 'TODAY' | 'LAST_WEEK' | 'THIS_MONTH' | 'THIS_YEAR' | 'CUSTOM';
