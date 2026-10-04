import { ApiError, request } from './client';

// Contract copied from the web dashboard (src/apis/*.ts). Do not change paths or param names.
// The board poll and push registration run natively (Api.kt) so they work without JS.

export const requestOtp = async (phone: string): Promise<string> => {
  const res = await request<{ response?: { verificationId?: string } }>('POST', '/quickVerse/v1/requestOtp', {
    body: { phone },
  });
  const verificationId = res?.response?.verificationId;
  if (!verificationId) throw new ApiError('Could not send OTP. Please try again.', null);
  return verificationId;
};

export interface LoginResult {
  jwt: string;
  shopId: string;
  phone: string;
}

export const login = async (phone: string, otp: string, verificationId: string): Promise<LoginResult> => {
  const res = await request<{ jwt?: unknown; shopId?: unknown; phone?: unknown }>('POST', '/quickVerse/v1/login', {
    body: { phone, otp, verificationId },
  });
  if (typeof res?.jwt !== 'string' || res.shopId === undefined || res.shopId === null) {
    throw new ApiError('Login failed. Please try again.', null);
  }
  return { jwt: res.jwt, shopId: String(res.shopId), phone: typeof res.phone === 'string' ? res.phone : phone };
};

const orderPath = (orderId: string, action: string) =>
  `/quickVerse/v2/order/${encodeURIComponent(orderId)}/${action}`;

export const acceptOrder = (orderId: string, preparationTime: number) =>
  request<unknown>('PATCH', orderPath(orderId, 'accept'), { query: { preparationTime } });

export const rejectOrder = (orderId: string, reason: string) =>
  request<unknown>('PATCH', orderPath(orderId, 'reject'), { query: { reason } });

export const markOrderReady = (orderId: string) => request<unknown>('PATCH', orderPath(orderId, 'ready'));

export const handoverOrder = (orderId: string) => request<unknown>('PATCH', orderPath(orderId, 'handover'));
