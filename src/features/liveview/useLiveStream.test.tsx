/** useLiveStream: rời ô (unmount) khi `connectWhep` còn đang bắt tay → phiên trả về sau phải được đóng (DELETE WHEP). */
import { renderHook } from "@testing-library/react";

import { connectWhep, type WhepSession } from "@/shared/media/whep";

import { useLiveStream } from "./useLiveStream";

vi.mock("@/shared/media/whep", () => ({
  whepSupported: () => true,
  connectWhep: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocked = vi.mocked(connectWhep);

afterEach(() => mocked.mockReset());

test("unmount khi đang chờ connectWhep → session trả về sau được close", async () => {
  const d = deferred<WhepSession>();
  mocked.mockReturnValue(d.promise);
  const { unmount } = renderHook(() => useLiveStream("/live/cam-1/whep", false));
  expect(mocked).toHaveBeenCalledTimes(1);

  unmount();
  const close = vi.fn();
  d.resolve({ close });
  await d.promise;
  await Promise.resolve();

  expect(close).toHaveBeenCalledTimes(1);
});

test("unmount khi đã kết nối → close ngay; chưa unmount thì không close", async () => {
  const close = vi.fn();
  mocked.mockResolvedValue({ close });
  const { unmount } = renderHook(() => useLiveStream("/live/cam-1/whep", false));
  await vi.waitFor(() => expect(mocked).toHaveBeenCalled());
  await Promise.resolve();
  expect(close).not.toHaveBeenCalled();

  unmount();
  expect(close).toHaveBeenCalledTimes(1);
});

test("unmount rồi connectWhep lỗi → không đổi state, không ném lỗi", async () => {
  const d = deferred<WhepSession>();
  mocked.mockReturnValue(d.promise);
  const { unmount, result } = renderHook(() => useLiveStream("/live/cam-1/whep", false));
  unmount();
  d.reject(new Error("WHEP 404"));
  await d.promise.catch(() => undefined);
  await Promise.resolve();
  expect(result.current.status).toBe("connecting");
});
