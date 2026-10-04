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
  preparationTime?: number;
  orderItem?: OrderItem[];
  amountExcludingDeliveryFee?: number;
  paymentMethod?: string;
  deliveryPartnerDetails?: DeliveryPartnerDetails | null;
  assignedPartner?: { orderStatus?: string; OrderStatus?: string; [key: string]: unknown } | null;
}

export type OrderPhase = 'PENDING' | 'ACCEPTED' | 'READY_FOR_PICKUP';
