import { ApiError } from '../src/api/client';
import { acceptOrder, login, rejectOrder, requestOtp } from '../src/api/endpoints';

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
