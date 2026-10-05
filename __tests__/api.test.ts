import { ApiError } from '../src/api/client';
import {
  acceptOrder,
  getDashboardStats,
  getOrdersPage,
  getSchedule,
  login,
  rejectOrder,
  requestOtp,
  saveSchedule,
  setManualOffline,
} from '../src/api/endpoints';

const fetchMock = jest.fn();
(globalThis as { fetch: unknown }).fetch = fetchMock;

const reply = (status: number, body: unknown) =>
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

beforeEach(() => fetchMock.mockReset());

describe('backend contract (same as the web dashboard)', () => {
  it('sends the vendor headers and never the JWT on REST', async () => {
    reply(200, { response: { verificationId: 'v1' } });
    await expect(requestOtp('9876543210')).resolves.toBe('v1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://prd.quickverse.in/quickVerse/v1/requestOtp');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: expect.stringMatching(/^Basic /),
      'Request-Origin': 'VENDOR',
      Accept: 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({ phone: '9876543210' });
  });

  it('login returns jwt + shopId as string', async () => {
    reply(200, { jwt: 'a.b.c', shopId: 42, phone: '9876543210' });
    await expect(login('9876543210', '1234', 'v1')).resolves.toEqual({
      jwt: 'a.b.c',
      shopId: '42',
      phone: '9876543210',
    });
  });

  it('accept / reject put their values in the query string', async () => {
    reply(200, {});
    await acceptOrder('QV 1', 15);
    expect(fetchMock.mock.calls[0][0]).toBe('http://prd.quickverse.in/quickVerse/v2/order/QV%201/accept?preparationTime=15');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
    reply(200, {});
    await rejectOrder('QV1', 'out of stock');
    expect(fetchMock.mock.calls[1][0]).toBe('http://prd.quickverse.in/quickVerse/v2/order/QV1/reject?reason=out%20of%20stock');
  });

  it('surfaces the backend error message', async () => {
    reply(400, { error: { message: 'Invalid OTP' } });
    await expect(login('9876543210', '0000', 'v1')).rejects.toEqual(new ApiError('Invalid OTP', 400));
  });

  it('maps network failures to a readable error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    await expect(requestOtp('9876543210')).rejects.toMatchObject({ message: 'No connection to the server', status: null });
  });
});

describe('history, stats and store timings (same contract as the web dashboard)', () => {
  it('history page sends repeated orderStatus, timeRange and page', async () => {
    reply(200, { response: { orders: [{ orderId: 'A1' }, { orderId: 7 }], totalPages: 3 } });
    await expect(getOrdersPage('7', { statuses: ['REJECTED', 'CANCELLED'], timeRange: 'TODAY', page: 2 })).resolves.toEqual({
      orders: [{ orderId: 'A1' }],
      totalPages: 3,
    });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'http://prd.quickverse.in/quickVerse/v2/order/7/orders?orderStatus=REJECTED&orderStatus=CANCELLED&timeRange=TODAY&page=2',
    );
  });

  it('history "All" sends no orderStatus at all', async () => {
    reply(200, { response: {} });
    await expect(getOrdersPage('7', { statuses: [], timeRange: 'THIS_MONTH', page: 0 })).resolves.toEqual({ orders: [], totalPages: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe('http://prd.quickverse.in/quickVerse/v2/order/7/orders?timeRange=THIS_MONTH&page=0');
  });

  it('stats without the response wrapper is an error', async () => {
    reply(200, {});
    await expect(getDashboardStats('7')).rejects.toMatchObject({ message: "Could not load today's numbers" });
    expect(fetchMock.mock.calls[0][0]).toBe('http://prd.quickverse.in/quickVerse/v2/order/7/dashboard-stats');
  });

  it('reads the schedule', async () => {
    reply(200, { manualOfflineOverride: false, operatingHoursJson: '{"Sun":{"openTime":"00:00","closeTime":"00:00"}}' });
    await expect(getSchedule('7')).resolves.toEqual({ manualOffline: false, week: { Sun: { openTime: '00:00', closeTime: '00:00' } } });
    expect(fetchMock.mock.calls[0][0]).toBe('http://prd.quickverse.in/v1/vendor-schedules/shop/7');
  });

  it('online/offline switch is a PATCH with the flag in the query', async () => {
    reply(200, 'ok');
    await setManualOffline('7', true);
    expect(fetchMock.mock.calls[0][0]).toBe('http://prd.quickverse.in/v1/vendor-schedules/shop/7/manual-offline?manualOfflineOverride=true');
    expect(fetchMock.mock.calls[0][1].method).toBe('PATCH');
  });

  it('saving timings keeps the current manual-offline value', async () => {
    reply(200, {});
    await saveSchedule('7', { Mon: { openTime: '10:00', closeTime: '11:00' } }, true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://prd.quickverse.in/v1/vendor-schedules/configure');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      shopId: '7',
      manualOfflineOverride: true,
      scheduleActive: true,
      operatingHours: '{"Mon":{"openTime":"10:00","closeTime":"11:00"}}',
    });
  });
});
